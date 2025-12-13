/**
 * OpenAI Client Module
 *
 * Provides a configured OpenAI SDK client and helper functions for:
 * - Audio transcription (Whisper)
 * - Segment summarisation (GPT-4o-mini)
 * - Topic extraction (GPT-4.1-nano)
 * - Frame captioning (GPT-5-mini)
 */

import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

// ============================================================================
// Client Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn(
    '[openai] OPENAI_API_KEY not found in environment. API calls will fail.'
  );
}

/**
 * Configured OpenAI client instance.
 * Uses the OPENAI_API_KEY environment variable.
 */
export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ============================================================================
// Model Constants
// ============================================================================

export const MODELS = {
  WHISPER: 'whisper-1',
  SUMMARISATION: 'gpt-4o-mini',
  TOPIC_EXTRACTION: 'gpt-4.1-nano',
  CAPTIONING: 'gpt-5-mini',
} as const;

// ============================================================================
// System Prompts
// ============================================================================

const SUMMARISATION_SYSTEM_PROMPT = `You are a precise summarisation assistant for educational video content.
Your task is to create a concise, informative summary of the given transcript segment.

Guidelines:
- Keep the summary to 1-3 sentences maximum
- Focus on the key concept or information being explained
- Use clear, simple language
- Do not add information not present in the transcript
- Maintain technical accuracy for any domain-specific terms`;

const TOPIC_EXTRACTION_SYSTEM_PROMPT = `You are an expert at analyzing educational video transcripts and extracting structured topics.

Given an array of transcript segments (each with a segment ID), you must identify the main topics covered in the video.

For each topic, provide:
1. "label": A short, descriptive title (3-6 words)
2. "description": A one-sentence explanation of what the topic covers
3. "summary": A 2-3 sentence summary of the key points
4. "segmentIds": Array of segment IDs that belong to this topic

Rules:
- Group related segments into coherent topics
- A segment can belong to multiple topics if relevant
- Identify 2-8 topics depending on content breadth
- Topics should be ordered by their first appearance in the video

Return your response as a valid JSON array of topic objects.`;

const CAPTIONING_SYSTEM_PROMPT = `You are a visual description assistant for educational video frames.

Your task is to describe what is shown in the image in a way that captures:
- The main visual content (code, diagrams, slides, presenter, etc.)
- Any text visible on screen
- The context of what is being demonstrated or explained

Guidelines:
- Keep descriptions to 1-2 sentences
- Be specific about visible code, formulas, or diagrams
- Note the educational context when apparent
- Do not speculate about content not visible in the frame`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transcribes audio using OpenAI's Whisper model.
 *
 * @param buffer - Audio data as a Buffer
 * @param mimeType - MIME type of the audio (e.g., 'audio/mp3', 'audio/wav')
 * @returns Promise resolving to the transcribed text
 * @throws Error if transcription fails
 *
 * @example
 * ```ts
 * const audioBuffer = await extractAudioFromVideo(videoBuffer);
 * const transcript = await transcribeAudioWhisper(audioBuffer, 'audio/mp3');
 * ```
 */
export async function transcribeAudioWhisper(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[transcribeAudioWhisper] Empty buffer provided');
  }

  // Determine file extension from MIME type
  const extensionMap: Record<string, string> = {
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  };

  const extension = extensionMap[mimeType] || 'mp3';
  const filename = `audio.${extension}`;

  try {
    // Convert Buffer to File object for OpenAI SDK
    const file = await toFile(buffer, filename, { type: mimeType });

    const response = await openai.audio.transcriptions.create({
      file,
      model: MODELS.WHISPER,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    return response.text;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown transcription error';
    throw new Error(`[transcribeAudioWhisper] Failed: ${message}`);
  }
}

/**
 * Transcribes audio with detailed segment information including timestamps.
 *
 * @param buffer - Audio data as a Buffer
 * @param mimeType - MIME type of the audio
 * @returns Promise resolving to transcription with segments
 * @throws Error if transcription fails
 */
export async function transcribeAudioWithSegments(
  buffer: Buffer,
  mimeType: string
): Promise<{
  text: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    avgLogprob: number;
  }>;
  language: string;
  duration: number;
}> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[transcribeAudioWithSegments] Empty buffer provided');
  }

  const extensionMap: Record<string, string> = {
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  };

  const extension = extensionMap[mimeType] || 'mp3';
  const filename = `audio.${extension}`;

  try {
    const file = await toFile(buffer, filename, { type: mimeType });

    const response = await openai.audio.transcriptions.create({
      file,
      model: MODELS.WHISPER,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    // Type assertion for verbose_json response
    const verboseResponse = response as OpenAI.Audio.Transcription & {
      segments?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
        avg_logprob: number;
      }>;
      language?: string;
      duration?: number;
    };

    return {
      text: verboseResponse.text,
      segments: (verboseResponse.segments || []).map((seg) => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        avgLogprob: seg.avg_logprob,
      })),
      language: verboseResponse.language || 'en',
      duration: verboseResponse.duration || 0,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown transcription error';
    throw new Error(`[transcribeAudioWithSegments] Failed: ${message}`);
  }
}

/**
 * Summarises a transcript segment using GPT-4o-mini.
 *
 * @param text - The transcript text to summarise
 * @returns Promise resolving to a concise summary
 * @throws Error if summarisation fails
 *
 * @example
 * ```ts
 * const summary = await summariseSegment("In this video we'll learn about arrays...");
 * // Returns: "Introduction to arrays and their purpose in programming."
 * ```
 */
export async function summariseSegment(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    throw new Error('[summariseSegment] Empty text provided');
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.SUMMARISATION,
      messages: [
        { role: 'system', content: SUMMARISATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Summarise the following transcript segment:\n\n${text}`,
        },
      ]
    });

    const summary = response.choices[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('Empty response from model');
    }

    return summary;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown summarisation error';
    throw new Error(`[summariseSegment] Failed: ${message}`);
  }
}

/**
 * Extracts topics from video transcript segments using GPT-4.1-nano.
 *
 * @param segments - Array of segment objects with id and text
 * @returns Promise resolving to array of extracted topics
 * @throws Error if topic extraction fails
 *
 * @example
 * ```ts
 * const topics = await extractTopicsForVideo([
 *   { id: 'seg_0001', text: 'Today we learn about arrays...' },
 *   { id: 'seg_0002', text: 'Arrays store multiple values...' },
 * ]);
 * ```
 */
export async function extractTopicsForVideo(
  segments: Array<{ id: string; text: string }>
): Promise<
  Array<{
    label: string;
    description: string;
    summary: string;
    segmentIds: string[];
  }>
> {
  if (!segments || segments.length === 0) {
    throw new Error('[extractTopicsForVideo] No segments provided');
  }

  // Format segments for the prompt
  const formattedSegments = segments
    .map((seg) => `[${seg.id}]: ${seg.text}`)
    .join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.TOPIC_EXTRACTION,
      messages: [
        { role: 'system', content: TOPIC_EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract topics from the following transcript segments:\n\n${formattedSegments}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('Empty response from model');
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    // Handle both { topics: [...] } and direct array formats
    const topicsArray = Array.isArray(parsed) ? parsed : parsed.topics;

    if (!Array.isArray(topicsArray)) {
      throw new Error('Invalid response format: expected array of topics');
    }

    // Validate and normalize each topic
    return topicsArray.map(
      (topic: {
        label?: string;
        description?: string;
        summary?: string;
        segmentIds?: string[];
        segment_ids?: string[];
      }) => ({
        label: String(topic.label || 'Untitled Topic'),
        description: String(topic.description || ''),
        summary: String(topic.summary || ''),
        segmentIds: Array.isArray(topic.segmentIds)
          ? topic.segmentIds
          : Array.isArray(topic.segment_ids)
            ? topic.segment_ids
            : [],
      })
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        '[extractTopicsForVideo] Failed to parse JSON response from model'
      );
    }
    const message =
      error instanceof Error ? error.message : 'Unknown topic extraction error';
    throw new Error(`[extractTopicsForVideo] Failed: ${message}`);
  }
}

/**
 * Generates a caption for a video frame using GPT-5-mini with vision.
 *
 * @param base64Jpeg - Base64-encoded JPEG image data (without data URI prefix)
 * @returns Promise resolving to a descriptive caption
 * @throws Error if caption generation fails
 *
 * @example
 * ```ts
 * const caption = await captionFrameBase64(frameBase64);
 * // Returns: "Code editor showing an array declaration with syntax highlighting."
 * ```
 */
export async function captionFrameBase64(base64Jpeg: string): Promise<string> {
  if (!base64Jpeg || base64Jpeg.length === 0) {
    throw new Error('[captionFrameBase64] Empty base64 data provided');
  }

  // Remove data URI prefix if present
  const cleanBase64 = base64Jpeg.replace(/^data:image\/\w+;base64,/, '');

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.CAPTIONING,
      messages: [
        { role: 'system', content: CAPTIONING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe what is shown in this video frame:',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${cleanBase64}`,
                detail: 'low', // Use low detail for faster processing
              },
            },
          ],
        },
      ]
    });

    const caption = response.choices[0]?.message?.content?.trim();

    if (!caption) {
      throw new Error('Empty response from model');
    }

    return caption;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown captioning error';
    throw new Error(`[captionFrameBase64] Failed: ${message}`);
  }
}

/**
 * Batch-processes multiple frames for captioning.
 * Processes sequentially to avoid rate limits.
 *
 * @param frames - Array of base64-encoded JPEG images
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to array of captions (same order as input)
 */
export async function captionFramesBatch(
  frames: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  const captions: string[] = [];

  for (let i = 0; i < frames.length; i++) {
    const caption = await captionFrameBase64(frames[i]);
    captions.push(caption);

    if (onProgress) {
      onProgress(i + 1, frames.length);
    }
  }

  return captions;
}

/**
 * Batch-processes multiple segments for summarisation.
 * Processes sequentially to avoid rate limits.
 *
 * @param texts - Array of transcript texts to summarise
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to array of summaries (same order as input)
 */
export async function summariseSegmentsBatch(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  const summaries: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const summary = await summariseSegment(texts[i]);
    summaries.push(summary);

    if (onProgress) {
      onProgress(i + 1, texts.length);
    }
  }

  return summaries;
}

