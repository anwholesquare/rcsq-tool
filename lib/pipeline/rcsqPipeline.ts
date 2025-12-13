/**
 * RCSQ Pipeline - Main Video Processing Orchestrator
 *
 * Coordinates all processing steps to transform a video file into
 * a fully populated RcsqResult JSON structure.
 *
 * Processing Flow:
 * 1. Generate video ID and compute MD5 hash
 * 2. Extract technical metadata (ffprobe)
 * 3. Extract audio and transcribe (Whisper)
 * 4. Segment transcript and embed text (Voyage)
 * 5. Extract topics from segments (GPT-4.1-nano)
 * 6. Extract frames at 5s intervals, caption, and embed (GPT-5-mini + Voyage)
 * 7. Process faces from client detections (Sharp + Voyage)
 * 8. Assemble final result with usage statistics
 */

import {
  RcsqResult,
  Segment,
  Topic,
  Frame,
  Face,
  ModelTokenUsage,
  UsageStats,
  DEFAULT_MODELS,
  RCSQ_TOOL_NAME,
  RCSQ_VERSION,
} from '@/types/rcsq';

import {
  extractTechnicalInfo,
  extractAudioAsWav,
  extractFrames,
  computeMd5,
} from '@/lib/media/processing';

import {
  transcribeAudioWithSegments,
  extractTopicsForVideo,
  captionFrameBase64,
} from '@/lib/clients/openai';

import {
  embedTextVoyage,
  embedImageVoyage,
  embedTextBatchVoyage,
} from '@/lib/clients/voyage';

import {
  detectAndProcessFaces,
  deduplicateFaces,
  ProcessedFace,
  FACE_DETECTION_MODEL,
} from '@/lib/media/faceDetection';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for the RCSQ pipeline.
 */
export interface RcsqPipelineInput {
  /** Video file as Buffer */
  buffer: Buffer;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'video/mp4') */
  mimeType: string;
  /** Whether to enable face detection (default: true) */
  enableFaceDetection?: boolean;
}

/**
 * Pipeline configuration options.
 */
export interface RcsqPipelineOptions {
  /** Interval between frames in seconds (default: 5) */
  frameIntervalSec?: number;
  /** Maximum frames to extract (default: 1000) */
  maxFrames?: number;
  /** Progress callback */
  onProgress?: (stage: string, percent: number) => void;
}

/**
 * Internal transcript segment from Whisper.
 */
interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avgLogprob: number;
}

/**
 * Token usage tracker for the pipeline.
 */
interface TokenTracker {
  whisper: { inputTokens: number; outputTokens: number };
  'gpt-4o-mini': { inputTokens: number; outputTokens: number };
  'gpt-4.1-nano': { inputTokens: number; outputTokens: number };
  'gpt-5-mini': { inputTokens: number; outputTokens: number };
  'voyage-3-large': { inputTokens: number; outputTokens: number };
  'voyage-multimodal-3': { inputTokens: number; outputTokens: number };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FRAME_INTERVAL_SEC = 5;
const DEFAULT_MAX_FRAMES = 1000;

/**
 * Pricing per 1M tokens (USD) - approximate as of late 2024
 * Update these values as pricing changes
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'whisper-1': { input: 0.006, output: 0 }, // $0.006 per minute ≈ per 1M chars
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 }, // Estimated
  'gpt-5-mini': { input: 0.30, output: 1.20 }, // Estimated
  'voyage-3-large': { input: 0.06, output: 0 }, // $0.06 per 1M tokens
  'voyage-multimodal-3': { input: 0.12, output: 0 }, // $0.12 per 1M tokens
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates an empty token tracker.
 */
function createTokenTracker(): TokenTracker {
  return {
    whisper: { inputTokens: 0, outputTokens: 0 },
    'gpt-4o-mini': { inputTokens: 0, outputTokens: 0 },
    'gpt-4.1-nano': { inputTokens: 0, outputTokens: 0 },
    'gpt-5-mini': { inputTokens: 0, outputTokens: 0 },
    'voyage-3-large': { inputTokens: 0, outputTokens: 0 },
    'voyage-multimodal-3': { inputTokens: 0, outputTokens: 0 },
  };
}

/**
 * Estimates token count from text (rough approximation: 1 token ≈ 4 chars).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimates token count for an image (based on resolution, rough estimate).
 * For vision models, images typically cost 85-1105 tokens depending on detail.
 */
function estimateImageTokens(base64Length: number): number {
  // Rough estimate: base64 length / 1000 gives approximate token cost
  // Low detail images ≈ 85 tokens, high detail ≈ 170-1105 tokens
  return Math.max(85, Math.ceil(base64Length / 1000));
}

/**
 * Calculates cost for a model's token usage.
 */
function calculateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

/**
 * Converts token tracker to usage stats.
 */
function trackerToUsageStats(tracker: TokenTracker): UsageStats {
  const models: ModelTokenUsage[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (const [model, usage] of Object.entries(tracker)) {
    const total = usage.inputTokens + usage.outputTokens;
    if (total > 0) {
      const cost = calculateModelCost(model, usage.inputTokens, usage.outputTokens);
      models.push({
        model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: total,
        estimated_cost_usd: cost,
      });
      totalTokens += total;
      totalCost += cost;
    }
  }

  return {
    models,
    total_tokens: totalTokens,
    total_estimated_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
  };
}

/**
 * Generates a unique RCSQ video ID.
 */
function generateVideoId(): string {
  const epochTime = Math.floor(Date.now() / 1000);
  const uuid = crypto.randomUUID().split('-')[0];
  return `vid_${epochTime}_${uuid}`;
}

/**
 * Converts Whisper's log probability to a 0-1 confidence score.
 */
function logProbToConfidence(avgLogprob: number): number {
  const confidence = Math.exp(avgLogprob);
  return Math.round(confidence * 100) / 100;
}

/**
 * Formats segment ID with padding.
 */
function formatSegmentId(index: number): string {
  return `seg_${String(index + 1).padStart(4, '0')}`;
}

/**
 * Formats topic ID with padding.
 */
function formatTopicId(index: number): string {
  return `topic_${String(index + 1).padStart(4, '0')}`;
}

/**
 * Formats frame ID with padding.
 */
function formatFrameId(index: number): string {
  return `frame_${String(index + 1).padStart(4, '0')}`;
}

/**
 * Formats face ID with padding.
 */
function formatFaceId(index: number): string {
  return `face_${String(index + 1).padStart(4, '0')}`;
}

/**
 * Processes transcript segments into the output format with embeddings.
 */
async function processSegments(
  whisperSegments: WhisperSegment[],
  rcsqVideoId: string,
  tracker: TokenTracker,
  onProgress?: (completed: number, total: number) => void
): Promise<Segment[]> {
  if (whisperSegments.length === 0) {
    return [];
  }

  // Extract all segment texts for batch embedding
  const texts = whisperSegments.map((seg) => seg.text);

  // Track Voyage tokens (estimate based on text length)
  const totalTextLength = texts.reduce((sum, t) => sum + t.length, 0);
  tracker['voyage-3-large'].inputTokens += estimateTokens(texts.join(' '));

  // Batch embed all texts at once (more efficient)
  const embeddings = await embedTextBatchVoyage(texts);

  // Build segment objects
  const segments: Segment[] = whisperSegments.map((seg, index) => {
    if (onProgress) {
      onProgress(index + 1, whisperSegments.length);
    }

    return {
      segment_id: index + 1,
      rcsq_video_id: rcsqVideoId,
      time: {
        start_sec: Math.round(seg.start * 100) / 100,
        end_sec: Math.round(seg.end * 100) / 100,
      },
      transcript: {
        text: seg.text,
        avg_confidence: logProbToConfidence(seg.avgLogprob),
      },
      text_embedding: {
        model: DEFAULT_MODELS.text_embedding.name,
        vector: embeddings[index],
      },
    };
  });

  return segments;
}

/**
 * Processes topics from segments.
 */
async function processTopics(
  segments: Segment[],
  rcsqVideoId: string,
  tracker: TokenTracker
): Promise<Topic[]> {
  if (segments.length === 0) {
    return [];
  }

  // Prepare segment data for topic extraction
  const segmentData = segments.map((seg) => ({
    id: formatSegmentId(seg.segment_id - 1),
    text: seg.transcript.text,
  }));

  // Track GPT-4.1-nano tokens
  const inputText = segmentData.map((s) => `[${s.id}]: ${s.text}`).join('\n\n');
  tracker['gpt-4.1-nano'].inputTokens += estimateTokens(inputText) + 200; // +200 for system prompt

  // Extract topics using GPT-4.1-nano
  const rawTopics = await extractTopicsForVideo(segmentData);

  // Track output tokens
  const outputText = JSON.stringify(rawTopics);
  tracker['gpt-4.1-nano'].outputTokens += estimateTokens(outputText);

  // Build topic objects
  const topics: Topic[] = rawTopics.map((topic, index) => ({
    topic_id: formatTopicId(index),
    rcsq_video_id: rcsqVideoId,
    label: topic.label,
    description: topic.description,
    summary: {
      text: topic.summary,
      model: DEFAULT_MODELS.segment_summarisation.name,
    },
    segment_ids: topic.segmentIds,
  }));

  return topics;
}

/**
 * Concurrency limit for frame processing.
 */
const FRAME_CONCURRENCY = 6;

/**
 * Processes a single frame: caption and embed.
 */
async function processSingleFrame(
  extracted: { timestampSec: number; jpegBase64: string },
  index: number,
  rcsqVideoId: string,
  tracker: TokenTracker
): Promise<Frame> {
  // Track GPT-5-mini tokens (vision)
  tracker['gpt-5-mini'].inputTokens += estimateImageTokens(extracted.jpegBase64.length) + 50;

  // Caption the frame using GPT-5-mini vision
  const caption = await captionFrameBase64(extracted.jpegBase64);

  // Track output tokens
  tracker['gpt-5-mini'].outputTokens += estimateTokens(caption);

  // Track Voyage multimodal tokens
  tracker['voyage-multimodal-3'].inputTokens += estimateImageTokens(extracted.jpegBase64.length);

  // Embed the frame using Voyage multimodal
  const embedding = await embedImageVoyage(extracted.jpegBase64);

  return {
    frame_id: formatFrameId(index),
    rcsq_video_id: rcsqVideoId,
    time: {
      timestamp_sec: extracted.timestampSec,
    },
    image: {
      encoding: 'image/jpeg',
      data_base64: extracted.jpegBase64,
    },
    caption: {
      text: caption,
    },
    image_embedding: {
      model: DEFAULT_MODELS.image_embedding.name,
      vector: embedding,
    },
  };
}

/**
 * Processes frames concurrently with a pool of workers.
 * Maintains up to FRAME_CONCURRENCY (6) concurrent operations.
 */
async function processFrames(
  extractedFrames: Array<{ timestampSec: number; jpegBase64: string }>,
  rcsqVideoId: string,
  tracker: TokenTracker,
  onProgress?: (completed: number, total: number) => void
): Promise<Frame[]> {
  if (extractedFrames.length === 0) {
    return [];
  }

  const total = extractedFrames.length;
  const results: Frame[] = new Array(total);
  let completed = 0;
  let nextIndex = 0;

  // Process frames with concurrency pool
  const processNext = async (): Promise<void> => {
    while (nextIndex < total) {
      const currentIndex = nextIndex++;
      const extracted = extractedFrames[currentIndex];

      try {
        const frame = await processSingleFrame(
          extracted,
          currentIndex,
          rcsqVideoId,
          tracker
        );
        results[currentIndex] = frame;
      } catch (error) {
        console.error(`[processFrames] Error processing frame ${currentIndex}:`, error);
        throw error;
      }

      completed++;
      if (onProgress) {
        onProgress(completed, total);
      }
    }
  };

  // Start FRAME_CONCURRENCY workers
  const workers = Array(Math.min(FRAME_CONCURRENCY, total))
    .fill(null)
    .map(() => processNext());

  // Wait for all workers to complete
  await Promise.all(workers);

  return results;
}

/**
 * Detects and processes faces using AWS Rekognition.
 */
async function processFaces(
  extractedFrames: Array<{ timestampSec: number; jpegBase64: string }>,
  rcsqVideoId: string,
  tracker: TokenTracker,
  onProgress?: (completed: number, total: number) => void
): Promise<Face[]> {
  if (extractedFrames.length === 0) {
    return [];
  }

  // Detect faces in all frames using AWS Rekognition
  const detectedFaces = await detectAndProcessFaces(
    extractedFrames,
    (completed, total) => {
      // Report detection progress (first half)
      if (onProgress) {
        onProgress(Math.round(completed / 2), total);
      }
    }
  );

  if (detectedFaces.length === 0) {
    console.log('[processFaces] No faces detected in any frame');
    return [];
  }

  // Deduplicate faces that appear in consecutive frames
  const uniqueFaces = deduplicateFaces(detectedFaces);

  // Generate embeddings for unique faces
  const faces: Face[] = [];

  for (let i = 0; i < uniqueFaces.length; i++) {
    const face = uniqueFaces[i];

    // Track Voyage multimodal tokens for face (using resized image size)
    tracker['voyage-multimodal-3'].inputTokens += estimateImageTokens(face.imageBase64ForEmbedding.length);

    // Embed the face image (using resized version, max 448px height)
    const embedding = await embedImageVoyage(face.imageBase64ForEmbedding);

    faces.push({
      face_id: formatFaceId(i),
      rcsq_video_id: rcsqVideoId,
      frame_id: face.frameId,
      time: {
        timestamp_sec: face.timestampSec,
      },
      image: {
        encoding: 'image/jpeg',
        data_base64: face.imageBase64, // Original resolution cropped face
      },
      face_embedding: {
        model: DEFAULT_MODELS.image_embedding.name,
        vector: embedding,
      },
    });

    if (onProgress) {
      // Report embedding progress (second half)
      onProgress(
        Math.round(extractedFrames.length / 2) + Math.round((i + 1) / uniqueFaces.length * extractedFrames.length / 2),
        extractedFrames.length
      );
    }
  }

  console.log(`[processFaces] Processed ${faces.length} unique faces`);
  return faces;
}

// ============================================================================
// Main Pipeline Function
// ============================================================================

/**
 * Runs the complete RCSQ video processing pipeline.
 *
 * @param input - Video buffer, filename, mimeType, and optional client-detected faces
 * @param options - Optional configuration (frameIntervalSec, maxFrames, progress callback)
 * @returns Promise resolving to complete RcsqResult
 * @throws Error if any processing step fails
 *
 * @example
 * ```ts
 * const result = await runRcsqPipeline({
 *   buffer: videoBuffer,
 *   filename: 'lecture.mp4',
 *   mimeType: 'video/mp4',
 *   enableFaceDetection: true, // Uses AWS Rekognition
 * }, {
 *   frameIntervalSec: 5,  // Extract frame every 5 seconds
 *   maxFrames: 1000,      // Max 1000 frames
 * });
 * ```
 */
export async function runRcsqPipeline(
  input: RcsqPipelineInput,
  options: RcsqPipelineOptions = {}
): Promise<RcsqResult> {
  const startTime = Date.now();
  const { buffer, filename, mimeType, enableFaceDetection = true } = input;
  const {
    frameIntervalSec = DEFAULT_FRAME_INTERVAL_SEC,
    maxFrames = DEFAULT_MAX_FRAMES,
    onProgress,
  } = options;

  // Initialize token tracker
  const tracker = createTokenTracker();

  // Helper to report progress
  const reportProgress = (stage: string, percent: number) => {
    if (onProgress) {
      onProgress(stage, percent);
    }
    console.log(`[rcsqPipeline] ${stage}: ${percent}%`);
  };

  // =========================================================================
  // Step 1: Generate video ID and compute MD5 hash
  // =========================================================================
  reportProgress('Initializing', 0);

  const rcsqVideoId = generateVideoId();
  const md5Hash = computeMd5(buffer);

  reportProgress('Initializing', 100);

  // =========================================================================
  // Step 2: Extract technical metadata
  // =========================================================================
  reportProgress('Extracting metadata', 0);

  const technicalInfo = await extractTechnicalInfo(buffer);

  reportProgress('Extracting metadata', 100);

  // =========================================================================
  // Step 3: Extract audio and transcribe
  // =========================================================================
  reportProgress('Extracting audio', 0);

  const audioBuffer = await extractAudioAsWav(buffer);

  reportProgress('Extracting audio', 100);
  reportProgress('Transcribing', 0);

  const transcription = await transcribeAudioWithSegments(audioBuffer, 'audio/wav');

  // Track Whisper tokens (estimate based on audio duration in seconds)
  // Whisper uses ~25 tokens per second of audio
  tracker.whisper.inputTokens += Math.ceil(technicalInfo.durationSec * 25);
  tracker.whisper.outputTokens += estimateTokens(transcription.text);

  reportProgress('Transcribing', 100);

  // =========================================================================
  // Step 4: Process segments and embed text
  // =========================================================================
  reportProgress('Processing segments', 0);

  const segments = await processSegments(
    transcription.segments,
    rcsqVideoId,
    tracker,
    (completed, total) => {
      reportProgress('Processing segments', Math.round((completed / total) * 100));
    }
  );

  reportProgress('Processing segments', 100);

  // =========================================================================
  // Step 5: Extract topics
  // =========================================================================
  reportProgress('Extracting topics', 0);

  const topics = await processTopics(segments, rcsqVideoId, tracker);

  reportProgress('Extracting topics', 100);

  // =========================================================================
  // Step 6: Extract frames at 5s intervals, caption, and embed
  // =========================================================================
  reportProgress('Extracting frames', 0);

  const extractedFrames = await extractFrames(buffer, {
    intervalSec: frameIntervalSec,
    maxFrames: maxFrames,
  });

  reportProgress('Extracting frames', 100);
  reportProgress('Processing frames', 0);

  const frames = await processFrames(
    extractedFrames,
    rcsqVideoId,
    tracker,
    (completed, total) => {
      reportProgress('Processing frames', Math.round((completed / total) * 100));
    }
  );

  reportProgress('Processing frames', 100);

  // =========================================================================
  // Step 7: Detect and process faces using AWS Rekognition
  // =========================================================================
  let faces: Face[] = [];

  if (enableFaceDetection) {
    reportProgress('Detecting faces', 0);

    faces = await processFaces(
      extractedFrames,
      rcsqVideoId,
      tracker,
      (completed, total) => {
        reportProgress('Detecting faces', Math.round((completed / total) * 100));
      }
    );

    reportProgress('Detecting faces', 100);
  } else {
    console.log('[rcsqPipeline] Face detection disabled, skipping');
  }

  // =========================================================================
  // Step 8: Assemble final result
  // =========================================================================
  reportProgress('Finalizing', 0);

  const processingTimeSec = Math.round((Date.now() - startTime) / 10) / 100;
  const usageStats = trackerToUsageStats(tracker);

  const result: RcsqResult = {
    tool: RCSQ_TOOL_NAME,
    version: RCSQ_VERSION,
    created_at: new Date().toISOString(),
    video: {
      source: {
        filename,
        filesize_bytes: buffer.length,
        mime_type: mimeType,
      },
      technical: {
        duration_sec: technicalInfo.durationSec,
        frame_rate_fps: technicalInfo.frameRateFps,
        width: technicalInfo.width,
        height: technicalInfo.height,
        audio_sample_rate_hz: technicalInfo.audioSampleRateHz,
        audio_channels: technicalInfo.audioChannels,
      },
      hashes: {
        md5: md5Hash,
      },
      rcsq_video_id: rcsqVideoId,
    },
    models: {
      ...DEFAULT_MODELS,
      transcription: {
        ...DEFAULT_MODELS.transcription,
        language: transcription.language,
      },
    },
    segments,
    topics,
    frames,
    faces,
    stats: {
      total_segments: segments.length,
      total_topics: topics.length,
      total_frames: frames.length,
      total_faces: faces.length,
      processing_time_sec: processingTimeSec,
      usage: usageStats,
    },
  };

  reportProgress('Finalizing', 100);
  console.log(
    `[rcsqPipeline] Complete! Processed ${segments.length} segments, ${topics.length} topics, ${frames.length} frames, ${faces.length} faces in ${processingTimeSec}s`
  );
  console.log(
    `[rcsqPipeline] Total tokens: ${usageStats.total_tokens}, Estimated cost: $${usageStats.total_estimated_cost_usd.toFixed(4)}`
  );

  return result;
}

// ============================================================================
// Simplified Pipeline (without faces)
// ============================================================================

/**
 * Runs a simplified pipeline without face detection.
 * Useful when face detection is not needed or AWS credentials are not available.
 *
 * @param input - Video buffer, filename, and mimeType
 * @param options - Optional configuration
 * @returns Promise resolving to RcsqResult (with empty faces array)
 */
export async function runRcsqPipelineSimple(
  input: Omit<RcsqPipelineInput, 'enableFaceDetection'>,
  options?: RcsqPipelineOptions
): Promise<RcsqResult> {
  return runRcsqPipeline(
    { ...input, enableFaceDetection: false },
    options
  );
}
