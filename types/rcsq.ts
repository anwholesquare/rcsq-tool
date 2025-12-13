/**
 * RCSQ-Tool Output Schema Types
 * Version: 1.0.0
 *
 * These types define the exact JSON structure returned by the video processing API.
 */

// ============================================================================
// Vector Types
// ============================================================================

/** Embedding vector - array of floating point numbers */
export type EmbeddingVector = number[];

// ============================================================================
// Video Metadata Types
// ============================================================================

export interface VideoSource {
  filename: string;
  filesize_bytes: number;
  mime_type: string;
}

export interface VideoTechnical {
  duration_sec: number;
  frame_rate_fps: number;
  width: number;
  height: number;
  audio_sample_rate_hz: number;
  audio_channels: number;
}

export interface VideoHashes {
  md5: string;
}

export interface VideoInfo {
  source: VideoSource;
  technical: VideoTechnical;
  hashes: VideoHashes;
  rcsq_video_id: string;
}

// ============================================================================
// Model Configuration Types
// ============================================================================

export interface TranscriptionModel {
  provider: 'whisper';
  name: string;
  language: string;
}

export interface OpenAIModel {
  provider: 'openai';
  name: string;
}

export interface VoyageEmbeddingModel {
  provider: 'voyage';
  name: string;
  dimension: number;
}

export interface FaceDetectionModel {
  provider: 'aws_rekognition';
  name: string;
}

export interface ModelsConfig {
  transcription: TranscriptionModel;
  segment_summarisation: OpenAIModel;
  topic_extraction: OpenAIModel;
  text_embedding: VoyageEmbeddingModel;
  image_embedding: VoyageEmbeddingModel;
  captioning: OpenAIModel;
  face_detection: FaceDetectionModel;
}

// ============================================================================
// Segment Types
// ============================================================================

export interface TimeRange {
  start_sec: number;
  end_sec: number;
}

export interface Timestamp {
  timestamp_sec: number;
}

export interface Transcript {
  text: string;
  avg_confidence: number;
}

export interface TextEmbedding {
  model: string;
  vector: EmbeddingVector;
}

export interface Segment {
  segment_id: number;
  rcsq_video_id: string;
  time: TimeRange;
  transcript: Transcript;
  text_embedding: TextEmbedding;
}

// ============================================================================
// Topic Types
// ============================================================================

export interface TopicSummary {
  text: string;
  model: string;
}

export interface Topic {
  topic_id: string;
  rcsq_video_id: string;
  label: string;
  description: string;
  summary: TopicSummary;
  segment_ids: string[];
}

// ============================================================================
// Frame Types
// ============================================================================

export interface ImageData {
  encoding: 'image/jpeg' | 'image/png';
  data_base64: string;
}

export interface Caption {
  text: string;
}

export interface ImageEmbedding {
  model: string;
  vector: EmbeddingVector;
}

export interface Frame {
  frame_id: string;
  rcsq_video_id: string;
  time: Timestamp;
  image: ImageData;
  caption: Caption;
  image_embedding: ImageEmbedding;
}

// ============================================================================
// Face Types
// ============================================================================

export interface FaceEmbedding {
  model: string;
  vector: EmbeddingVector;
}

export interface Face {
  face_id: string;
  rcsq_video_id: string;
  frame_id: string;
  time: Timestamp;
  image: ImageData;
  face_embedding: FaceEmbedding;
}

// ============================================================================
// Stats Types
// ============================================================================

/**
 * Token usage for a specific model.
 */
export interface ModelTokenUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

/**
 * Aggregated usage statistics across all models.
 */
export interface UsageStats {
  models: ModelTokenUsage[];
  total_tokens: number;
  total_estimated_cost_usd: number;
}

export interface ProcessingStats {
  total_segments: number;
  total_topics: number;
  total_frames: number;
  total_faces: number;
  processing_time_sec: number;
  usage: UsageStats;
}

// ============================================================================
// Root Result Type
// ============================================================================

export interface RcsqResult {
  tool: 'rcsq-tool';
  version: string;
  created_at: string;
  video: VideoInfo;
  models: ModelsConfig;
  segments: Segment[];
  topics: Topic[];
  frames: Frame[];
  faces: Face[];
  stats: ProcessingStats;
}

// ============================================================================
// Constants
// ============================================================================

export const RCSQ_TOOL_NAME = 'rcsq-tool' as const;
export const RCSQ_VERSION = '1.0.0' as const;

export const DEFAULT_MODELS: ModelsConfig = {
  transcription: {
    provider: 'whisper',
    name: 'whisper-large-v3',
    language: 'en',
  },
  segment_summarisation: {
    provider: 'openai',
    name: 'gpt-4o-mini',
  },
  topic_extraction: {
    provider: 'openai',
    name: 'gpt-4.1-nano',
  },
  text_embedding: {
    provider: 'voyage',
    name: 'voyage-3-large',
    dimension: 1024,
  },
  image_embedding: {
    provider: 'voyage',
    name: 'voyage-multimodal-3',
    dimension: 1024,
  },
  captioning: {
    provider: 'openai',
    name: 'gpt-5-mini',
  },
  face_detection: {
    provider: 'aws_rekognition',
    name: 'DetectFaces',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique RCSQ video ID based on current timestamp and random UUID segment.
 */
export function generateRcsqVideoId(): string {
  const epochTime = Math.floor(Date.now() / 1000);
  const uuid = crypto.randomUUID().split('-')[0]; // Short UUID segment
  return `vid_${epochTime}_${uuid}`;
}

/**
 * Creates an empty RcsqResult skeleton with null-ish defaults.
 * Use this as a starting point and populate fields during processing.
 */
export function createEmptyRcsqResult(
  filename: string = '',
  filesizeBytes: number = 0,
  mimeType: string = 'video/mp4'
): RcsqResult {
  const rcsqVideoId = generateRcsqVideoId();

  return {
    tool: RCSQ_TOOL_NAME,
    version: RCSQ_VERSION,
    created_at: new Date().toISOString(),
    video: {
      source: {
        filename,
        filesize_bytes: filesizeBytes,
        mime_type: mimeType,
      },
      technical: {
        duration_sec: 0,
        frame_rate_fps: 0,
        width: 0,
        height: 0,
        audio_sample_rate_hz: 0,
        audio_channels: 0,
      },
      hashes: {
        md5: '',
      },
      rcsq_video_id: rcsqVideoId,
    },
    models: { ...DEFAULT_MODELS },
    segments: [],
    topics: [],
    frames: [],
    faces: [],
    stats: {
      total_segments: 0,
      total_topics: 0,
      total_frames: 0,
      total_faces: 0,
      processing_time_sec: 0,
      usage: {
        models: [],
        total_tokens: 0,
        total_estimated_cost_usd: 0,
      },
    },
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidRcsqResult(obj: unknown): obj is RcsqResult {
  if (typeof obj !== 'object' || obj === null) return false;
  const result = obj as RcsqResult;
  return (
    result.tool === RCSQ_TOOL_NAME &&
    typeof result.version === 'string' &&
    typeof result.created_at === 'string' &&
    typeof result.video === 'object' &&
    typeof result.models === 'object' &&
    Array.isArray(result.segments) &&
    Array.isArray(result.topics) &&
    Array.isArray(result.frames) &&
    Array.isArray(result.faces) &&
    typeof result.stats === 'object'
  );
}

// ============================================================================
// Builder Helpers (for constructing individual items)
// ============================================================================

export function createSegment(
  segmentId: number,
  rcsqVideoId: string,
  startSec: number,
  endSec: number,
  text: string,
  avgConfidence: number,
  embedding: EmbeddingVector
): Segment {
  return {
    segment_id: segmentId,
    rcsq_video_id: rcsqVideoId,
    time: {
      start_sec: startSec,
      end_sec: endSec,
    },
    transcript: {
      text,
      avg_confidence: avgConfidence,
    },
    text_embedding: {
      model: DEFAULT_MODELS.text_embedding.name,
      vector: embedding,
    },
  };
}

export function createTopic(
  topicId: string,
  rcsqVideoId: string,
  label: string,
  description: string,
  summaryText: string,
  segmentIds: string[]
): Topic {
  return {
    topic_id: topicId,
    rcsq_video_id: rcsqVideoId,
    label,
    description,
    summary: {
      text: summaryText,
      model: DEFAULT_MODELS.segment_summarisation.name,
    },
    segment_ids: segmentIds,
  };
}

export function createFrame(
  frameId: string,
  rcsqVideoId: string,
  timestampSec: number,
  imageBase64: string,
  captionText: string,
  embedding: EmbeddingVector,
  encoding: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Frame {
  return {
    frame_id: frameId,
    rcsq_video_id: rcsqVideoId,
    time: {
      timestamp_sec: timestampSec,
    },
    image: {
      encoding,
      data_base64: imageBase64,
    },
    caption: {
      text: captionText,
    },
    image_embedding: {
      model: DEFAULT_MODELS.image_embedding.name,
      vector: embedding,
    },
  };
}

export function createFace(
  faceId: string,
  rcsqVideoId: string,
  frameId: string,
  timestampSec: number,
  imageBase64: string,
  embedding: EmbeddingVector,
  encoding: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Face {
  return {
    face_id: faceId,
    rcsq_video_id: rcsqVideoId,
    frame_id: frameId,
    time: {
      timestamp_sec: timestampSec,
    },
    image: {
      encoding,
      data_base64: imageBase64,
    },
    face_embedding: {
      model: DEFAULT_MODELS.image_embedding.name,
      vector: embedding,
    },
  };
}

/**
 * Finalizes the stats object based on the current arrays in the result.
 */
export function finalizeStats(
  result: RcsqResult,
  processingTimeSec: number,
  usage?: UsageStats
): ProcessingStats {
  return {
    total_segments: result.segments.length,
    total_topics: result.topics.length,
    total_frames: result.frames.length,
    total_faces: result.faces.length,
    processing_time_sec: processingTimeSec,
    usage: usage || {
      models: [],
      total_tokens: 0,
      total_estimated_cost_usd: 0,
    },
  };
}

