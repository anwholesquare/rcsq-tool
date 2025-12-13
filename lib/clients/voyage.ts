/**
 * Voyage AI Client Module
 *
 * Provides HTTP client for Voyage embedding APIs:
 * - Text embeddings (voyage-3-large)
 * - Image/multimodal embeddings (voyage-multimodal-3)
 *
 * All embeddings return 1024-dimensional vectors.
 */

// ============================================================================
// Configuration
// ============================================================================

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

if (!VOYAGE_API_KEY) {
  console.warn(
    '[voyage] VOYAGE_API_KEY not found in environment. API calls will fail.'
  );
}

const VOYAGE_BASE_URL = 'https://api.voyageai.com/v1';

// ============================================================================
// Model Constants
// ============================================================================

export const VOYAGE_MODELS = {
  TEXT: 'voyage-3-large',
  MULTIMODAL: 'voyage-multimodal-3',
} as const;

export const EMBEDDING_DIMENSION = 1024;

// ============================================================================
// Retry Configuration
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

// ============================================================================
// Types
// ============================================================================

interface VoyageTextEmbeddingRequest {
  input: string | string[];
  model: string;
  input_type?: 'query' | 'document';
  truncation?: boolean;
}

interface VoyageMultimodalContent {
  type: 'text' | 'image_base64' | 'image_url';
  text?: string;
  image_base64?: string;
  image_url?: string;
}

interface VoyageMultimodalInput {
  content: VoyageMultimodalContent[];
}

interface VoyageMultimodalEmbeddingRequest {
  inputs: VoyageMultimodalInput[];
  model: string;
  input_type?: 'query' | 'document';
  truncation?: boolean;
}

interface VoyageEmbeddingData {
  object: 'embedding';
  embedding: number[];
  index: number;
}

interface VoyageEmbeddingResponse {
  object: 'list';
  data: VoyageEmbeddingData[];
  model: string;
  usage: {
    total_tokens: number;
  };
}

interface VoyageErrorResponse {
  detail?: string;
  message?: string;
  error?: {
    message: string;
    type: string;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Delays execution for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff with jitter.
 */
function calculateBackoff(attempt: number): number {
  const exponentialDelay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, MAX_BACKOFF_MS);
}

/**
 * Determines if an error is retryable based on status code.
 */
function isRetryableError(status: number): boolean {
  // Retry on rate limits (429) and server errors (5xx)
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Makes a request to Voyage API with retry logic.
 */
async function voyageRequest<T>(
  endpoint: string,
  body: unknown
): Promise<T> {
  const url = `${VOYAGE_BASE_URL}${endpoint}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${VOYAGE_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      // Handle non-OK responses
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as VoyageErrorResponse;
        const errorMessage =
          errorBody.detail ||
          errorBody.message ||
          errorBody.error?.message ||
          `HTTP ${response.status}`;

        // Check if we should retry
        if (isRetryableError(response.status) && attempt < MAX_RETRIES) {
          const backoffMs = calculateBackoff(attempt);
          console.warn(
            `[voyage] Request failed with ${response.status}, retrying in ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(backoffMs);
          continue;
        }

        throw new Error(`Voyage API error: ${errorMessage}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If it's a network error and we have retries left, retry
      if (
        attempt < MAX_RETRIES &&
        (error instanceof TypeError || // Network errors in fetch
          (error instanceof Error && error.message.includes('fetch')))
      ) {
        const backoffMs = calculateBackoff(attempt);
        console.warn(
          `[voyage] Network error, retrying in ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
        continue;
      }

      // Re-throw if it's an API error (already formatted) or we're out of retries
      throw lastError;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error('Unknown error in voyage request');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generates a text embedding using Voyage voyage-3-large model.
 *
 * @param text - The text to embed
 * @param inputType - Optional: 'query' for search queries, 'document' for content to be searched
 * @returns Promise resolving to a 1024-dimensional embedding vector
 * @throws Error if embedding generation fails
 *
 * @example
 * ```ts
 * const embedding = await embedTextVoyage("Introduction to arrays in programming");
 * console.log(embedding.length); // 1024
 * ```
 */
export async function embedTextVoyage(
  text: string,
  inputType: 'query' | 'document' = 'document'
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('[embedTextVoyage] Empty text provided');
  }

  if (!VOYAGE_API_KEY) {
    throw new Error('[embedTextVoyage] VOYAGE_API_KEY not configured');
  }

  try {
    const requestBody: VoyageTextEmbeddingRequest = {
      input: text,
      model: VOYAGE_MODELS.TEXT,
      input_type: inputType,
      truncation: true, // Automatically truncate if text exceeds model limit
    };

    const response = await voyageRequest<VoyageEmbeddingResponse>(
      '/embeddings',
      requestBody
    );

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding data in response');
    }

    const embedding = response.data[0].embedding;

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length}`
      );
    }

    return embedding;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown embedding error';
    throw new Error(`[embedTextVoyage] Failed: ${message}`);
  }
}

/**
 * Generates an image embedding using Voyage voyage-multimodal-3 model.
 *
 * @param base64Jpeg - Base64-encoded JPEG image data (with or without data URI prefix)
 * @returns Promise resolving to a 1024-dimensional embedding vector
 * @throws Error if embedding generation fails
 *
 * @example
 * ```ts
 * const frameBuffer = await extractFrame(videoBuffer, 12.0);
 * const base64 = frameBuffer.toString('base64');
 * const embedding = await embedImageVoyage(base64);
 * console.log(embedding.length); // 1024
 * ```
 */
export async function embedImageVoyage(base64Jpeg: string): Promise<number[]> {
  if (!base64Jpeg || base64Jpeg.length === 0) {
    throw new Error('[embedImageVoyage] Empty base64 data provided');
  }

  if (!VOYAGE_API_KEY) {
    throw new Error('[embedImageVoyage] VOYAGE_API_KEY not configured');
  }

  // Voyage multimodal API requires the full data URI prefix
  // Add it if not present
  let imageData = base64Jpeg;
  if (!imageData.startsWith('data:image/')) {
    imageData = `data:image/jpeg;base64,${imageData}`;
  }

  try {
    const requestBody: VoyageMultimodalEmbeddingRequest = {
      inputs: [
        {
          content: [
            {
              type: 'image_base64',
              image_base64: imageData,
            },
          ],
        },
      ],
      model: VOYAGE_MODELS.MULTIMODAL,
      input_type: 'document',
      truncation: true,
    };

    const response = await voyageRequest<VoyageEmbeddingResponse>(
      '/multimodalembeddings',
      requestBody
    );

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding data in response');
    }

    const embedding = response.data[0].embedding;

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length}`
      );
    }

    return embedding;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown embedding error';
    throw new Error(`[embedImageVoyage] Failed: ${message}`);
  }
}

/**
 * Batch-embeds multiple texts using Voyage voyage-3-large model.
 * More efficient than calling embedTextVoyage multiple times.
 *
 * @param texts - Array of texts to embed (max 128 per batch)
 * @param inputType - Optional: 'query' for search queries, 'document' for content
 * @returns Promise resolving to array of 1024-dimensional vectors (same order as input)
 * @throws Error if embedding generation fails
 *
 * @example
 * ```ts
 * const embeddings = await embedTextBatchVoyage([
 *   "First segment transcript...",
 *   "Second segment transcript...",
 * ]);
 * ```
 */
export async function embedTextBatchVoyage(
  texts: string[],
  inputType: 'query' | 'document' = 'document'
): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    throw new Error('[embedTextBatchVoyage] Empty texts array provided');
  }

  if (!VOYAGE_API_KEY) {
    throw new Error('[embedTextBatchVoyage] VOYAGE_API_KEY not configured');
  }

  // Voyage supports up to 128 texts per batch
  const MAX_BATCH_SIZE = 128;
  if (texts.length > MAX_BATCH_SIZE) {
    // Process in chunks
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const chunk = texts.slice(i, i + MAX_BATCH_SIZE);
      const chunkEmbeddings = await embedTextBatchVoyage(chunk, inputType);
      results.push(...chunkEmbeddings);
    }
    return results;
  }

  try {
    const requestBody: VoyageTextEmbeddingRequest = {
      input: texts,
      model: VOYAGE_MODELS.TEXT,
      input_type: inputType,
      truncation: true,
    };

    const response = await voyageRequest<VoyageEmbeddingResponse>(
      '/embeddings',
      requestBody
    );

    if (!response.data || response.data.length !== texts.length) {
      throw new Error(
        `Unexpected response: expected ${texts.length} embeddings, got ${response.data?.length}`
      );
    }

    // Sort by index to ensure correct order
    const sorted = [...response.data].sort((a, b) => a.index - b.index);

    return sorted.map((item) => {
      if (
        !Array.isArray(item.embedding) ||
        item.embedding.length !== EMBEDDING_DIMENSION
      ) {
        throw new Error(`Invalid embedding at index ${item.index}`);
      }
      return item.embedding;
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown batch embedding error';
    throw new Error(`[embedTextBatchVoyage] Failed: ${message}`);
  }
}

/**
 * Batch-embeds multiple images using Voyage voyage-multimodal-3 model.
 * Processes images sequentially due to API constraints.
 *
 * @param base64Images - Array of base64-encoded JPEG images
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to array of 1024-dimensional vectors (same order as input)
 * @throws Error if embedding generation fails
 */
export async function embedImageBatchVoyage(
  base64Images: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  if (!base64Images || base64Images.length === 0) {
    throw new Error('[embedImageBatchVoyage] Empty images array provided');
  }

  const embeddings: number[][] = [];

  for (let i = 0; i < base64Images.length; i++) {
    const embedding = await embedImageVoyage(base64Images[i]);
    embeddings.push(embedding);

    if (onProgress) {
      onProgress(i + 1, base64Images.length);
    }
  }

  return embeddings;
}

