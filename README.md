# RCSQ Tool

A video preprocessing tool for research applications. Processes videos entirely in serverless functions and returns structured JSON with transcription, topics, frames, and faces.

## Features

- **Video Transcription** – Whisper (whisper-1) with word-level timestamps
- **Segment Summarization** – GPT-4o-mini for transcript summaries
- **Topic Extraction** – GPT-4.1-nano for semantic topic grouping
- **Frame Captioning** – GPT-5-mini with vision for visual descriptions
- **Text Embeddings** – Voyage voyage-3-large (1024-dim)
- **Image Embeddings** – Voyage voyage-multimodal-3 (1024-dim)
- **Face Detection** – AWS Rekognition with cropped face embeddings
- **Real-time Progress** – Server-Sent Events for live UI updates
- **Cost Tracking** – Per-model token usage and estimated costs

## Tech Stack

- **Framework**: Next.js (App Router)
- **Runtime**: Node.js (serverless functions)
- **Media Processing**: FFmpeg/FFprobe (in-memory, no disk writes)
- **Language**: TypeScript (strict mode)

## Constraints

| Constraint | Value |
|------------|-------|
| Max upload size | 10 MB |
| Frame extraction interval | 5 seconds |
| Max frames | 1000 |
| Embedding dimension | 1024 |
| Max face embedding height | 448px |

## Installation

```bash
# Clone and install
pnpm install

# Run development server
pnpm dev
```

## Environment Variables

Create a `.env` file (optional, only needed if using `secret_token` mode):

```env
# Server secret token (allows clients to use server-side credentials)
RCSQ_SECRET_TOKEN=your-secret-token

# API Keys (used when client provides valid secret_token)
OPENAI_API_KEY=sk-...
VOYAGE_API_KEY=pa-...

# AWS Rekognition (for face detection)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

## API Endpoints

### `POST /api/rcsq`

Process a video and return JSON result.

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Video file (max 10MB) |
| `enableFaceDetection` | string | No | `"true"` or `"false"` (default: true) |
| `secret_token` | string | No* | Server token to use .env credentials |
| `openaiApiKey` | string | No* | OpenAI API key |
| `voyageApiKey` | string | No* | Voyage AI API key |
| `awsRegion` | string | No | AWS region (default: us-east-1) |
| `awsAccessKeyId` | string | No* | AWS access key ID |
| `awsSecretAccessKey` | string | No* | AWS secret access key |

*Provide either `secret_token` OR individual API keys.

**Supported MIME Types:**
- `video/mp4`
- `video/webm`
- `video/quicktime`
- `video/x-matroska`

### `POST /api/rcsq-stream`

Same as `/api/rcsq` but streams progress via SSE.

**SSE Events:**
- `progress` – `{ stage, percent, timestamp }`
- `complete` – `{ result, timestamp }`
- `error` – `{ message, timestamp }`

### `POST /api/health`

Check connectivity of all external services.

**JSON Body:**
```json
{
  "secret_token": "...",
  "openaiApiKey": "...",
  "voyageApiKey": "...",
  "awsRegion": "us-east-1",
  "awsAccessKeyId": "...",
  "awsSecretAccessKey": "..."
}
```

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "openai": { "status": "ok", "latency_ms": 234 },
    "voyage": { "status": "ok", "latency_ms": 156 },
    "aws_rekognition": { "status": "ok", "latency_ms": 89 },
    "ffmpeg": { "status": "ok", "version": "6.1" },
    "ffprobe": { "status": "ok", "version": "6.1" }
  }
}
```

## UI

Access the web interface at `/rcsq`:

- Upload video file (drag & drop or click)
- Choose authentication mode:
  - **Secret Token** – Use server-side credentials
  - **API Keys** – Provide keys directly
- Toggle face detection (requires AWS credentials)
- Real-time progress with detailed stage updates
- Results displayed in tabbed interface:
  - Overview (stats)
  - Segments (transcript + embeddings)
  - Topics (grouped themes)
  - Frames (visual timeline + captions)
  - Faces (detected faces with embeddings)
  - Models (configuration)
  - Costs (token usage breakdown)
- Download JSON result
- Import existing JSON for viewing

## Output Schema

```typescript
interface RcsqResult {
  tool: "rcsq-tool";
  version: "1.0.0";
  created_at: string;              // ISO 8601
  video: {
    source: { filename, filesize_bytes, mime_type };
    technical: { duration_sec, frame_rate_fps, width, height, audio_sample_rate_hz, audio_channels };
    hashes: { md5 };
    rcsq_video_id: string;         // vid_{epoch}_{uuid}
  };
  models: { ... };                 // Model configurations
  segments: Segment[];             // Transcript segments with embeddings
  topics: Topic[];                 // Extracted topics
  frames: Frame[];                 // Keyframes with captions + embeddings
  faces: Face[];                   // Detected faces with embeddings
  stats: {
    total_segments, total_topics, total_frames, total_faces;
    processing_time_sec: number;
    usage: {
      total_tokens, total_estimated_cost_usd;
      models: ModelTokenUsage[];
    };
  };
}
```

## Project Structure

```
rcsq-tool/
├── app/
│   ├── api/
│   │   ├── rcsq/route.ts           # Main processing endpoint
│   │   ├── rcsq-stream/route.ts    # SSE streaming endpoint
│   │   └── health/route.ts         # Service health check
│   └── rcsq/page.tsx               # Web UI
├── lib/
│   ├── clients/
│   │   ├── openai.ts               # OpenAI SDK helpers
│   │   └── voyage.ts               # Voyage AI HTTP client
│   ├── media/
│   │   ├── processing.ts           # FFmpeg/FFprobe utilities
│   │   └── faceDetection.ts        # AWS Rekognition
│   ├── pipeline/
│   │   └── rcsqPipeline.ts         # Main orchestrator
│   └── credentials.ts              # Credential resolution
├── types/
│   └── rcsq.ts                     # Output schema types
└── components/ui/                  # shadcn/ui components
```

## AWS Rekognition Setup

1. Go to AWS Console → IAM → Users → Create User
2. Attach policy: `AmazonRekognitionFullAccess`
3. Create access key (Access key ID + Secret access key)
4. Use region where Rekognition is available (e.g., `us-east-1`)


**Environment Variables in Vercel:**
- `RCSQ_SECRET_TOKEN`
- `OPENAI_API_KEY`
- `VOYAGE_API_KEY`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

