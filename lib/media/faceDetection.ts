/**
 * Face Detection Module (Server-side)
 *
 * Uses AWS Rekognition API to detect faces in video frames.
 * Processes extracted frames, detects faces, crops them, and prepares for embedding.
 */

import {
  RekognitionClient,
  DetectFacesCommand,
  Attribute,
} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';

// ============================================================================
// AWS Configuration
// ============================================================================

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    : undefined, // Use default credential chain if not explicitly set
});

// ============================================================================
// Types
// ============================================================================

/**
 * Bounding box for a detected face (pixel coordinates).
 */
export interface FaceBoundingBox {
  /** X coordinate of top-left corner (pixels) */
  x: number;
  /** Y coordinate of top-left corner (pixels) */
  y: number;
  /** Width of bounding box (pixels) */
  width: number;
  /** Height of bounding box (pixels) */
  height: number;
}

/**
 * Detected face with metadata.
 */
export interface DetectedFace {
  /** Bounding box in pixels */
  boundingBox: FaceBoundingBox;
  /** Detection confidence (0-100) */
  confidence: number;
}

/**
 * Processed face ready for embedding.
 */
export interface ProcessedFace {
  /** Frame timestamp in seconds */
  timestampSec: number;
  /** Bounding box in pixels */
  boundingBox: FaceBoundingBox;
  /** Cropped face image as base64 JPEG (original resolution) */
  imageBase64: string;
  /** Cropped face resized to max 448px height for embedding (base64 JPEG) */
  imageBase64ForEmbedding: string;
  /** Detection confidence (0-100) */
  confidence: number;
  /** Frame ID this face belongs to */
  frameId: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Minimum confidence threshold for face detection (0-100).
 */
export const FACE_DETECTION_THRESHOLD = 80;

/**
 * Model identifier for tracking in output JSON.
 */
export const FACE_DETECTION_MODEL = 'aws_rekognition';

/**
 * Padding around face crops (percentage of face dimensions).
 */
export const FACE_CROP_PADDING = 0.2;

/**
 * Concurrency limit for Rekognition API calls.
 */
const REKOGNITION_CONCURRENCY = 5;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Detects faces in a single frame using AWS Rekognition.
 *
 * @param base64Jpeg - Base64-encoded JPEG image
 * @returns Promise resolving to array of detected faces
 *
 * @example
 * ```ts
 * const faces = await detectFacesInFrame(frame.jpegBase64);
 * console.log(`Found ${faces.length} faces`);
 * ```
 */
export async function detectFacesInFrame(
  base64Jpeg: string
): Promise<DetectedFace[]> {
  if (!base64Jpeg || base64Jpeg.length === 0) {
    throw new Error('[detectFacesInFrame] Empty base64 data provided');
  }

  // Remove data URI prefix if present
  const cleanBase64 = base64Jpeg.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(cleanBase64, 'base64');

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('[detectFacesInFrame] Could not determine image dimensions');
  }

  try {
    const command = new DetectFacesCommand({
      Image: {
        Bytes: imageBuffer,
      },
      Attributes: [Attribute.DEFAULT],
    });

    const response = await rekognitionClient.send(command);

    if (!response.FaceDetails || response.FaceDetails.length === 0) {
      return [];
    }

    // Convert Rekognition response to our format
    const faces: DetectedFace[] = [];

    for (const face of response.FaceDetails) {
      if (!face.BoundingBox || !face.Confidence) {
        continue;
      }

      // Filter by confidence threshold
      if (face.Confidence < FACE_DETECTION_THRESHOLD) {
        continue;
      }

      // Convert normalized coordinates to pixels
      const boundingBox: FaceBoundingBox = {
        x: Math.round(face.BoundingBox.Left! * metadata.width),
        y: Math.round(face.BoundingBox.Top! * metadata.height),
        width: Math.round(face.BoundingBox.Width! * metadata.width),
        height: Math.round(face.BoundingBox.Height! * metadata.height),
      };

      faces.push({
        boundingBox,
        confidence: face.Confidence,
      });
    }

    return faces;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[detectFacesInFrame] Rekognition error:', message);
    // Return empty array on error to not block pipeline
    return [];
  }
}

/**
 * Maximum height for face images sent to embedding API.
 */
const MAX_EMBEDDING_HEIGHT = 448;

/**
 * Crops a face from an image with padding and returns both original and resized versions.
 *
 * @param imageBuffer - Source image as Buffer
 * @param boundingBox - Face bounding box in pixels
 * @param imageWidth - Image width
 * @param imageHeight - Image height
 * @param padding - Padding as percentage (0-1)
 * @returns Object with original cropped face and resized version for embedding
 */
async function cropFaceFromImage(
  imageBuffer: Buffer,
  boundingBox: FaceBoundingBox,
  imageWidth: number,
  imageHeight: number,
  padding: number = FACE_CROP_PADDING
): Promise<{ original: string; forEmbedding: string }> {
  // Calculate padded region
  const padX = Math.round(boundingBox.width * padding);
  const padY = Math.round(boundingBox.height * padding);

  const left = Math.max(0, boundingBox.x - padX);
  const top = Math.max(0, boundingBox.y - padY);
  const right = Math.min(imageWidth, boundingBox.x + boundingBox.width + padX);
  const bottom = Math.min(imageHeight, boundingBox.y + boundingBox.height + padY);

  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    throw new Error('Invalid crop dimensions');
  }

  // Crop the face (original resolution)
  const croppedBuffer = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();

  const originalBase64 = croppedBuffer.toString('base64');

  // Resize for embedding if needed (max 448px height)
  let embeddingBase64: string;

  if (height > MAX_EMBEDDING_HEIGHT) {
    const resizedBuffer = await sharp(croppedBuffer)
      .resize({
        height: MAX_EMBEDDING_HEIGHT,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    embeddingBase64 = resizedBuffer.toString('base64');
  } else {
    // No resize needed, use original
    embeddingBase64 = originalBase64;
  }

  return {
    original: originalBase64,
    forEmbedding: embeddingBase64,
  };
}

/**
 * Processes a single frame to detect and crop faces.
 *
 * @param frame - Extracted frame with timestamp and base64 data
 * @param frameIndex - Index of the frame (for frame_id)
 * @returns Array of processed faces
 */
async function processFrameForFaces(
  frame: { timestampSec: number; jpegBase64: string },
  frameIndex: number
): Promise<ProcessedFace[]> {
  // Clean base64 and get buffer
  const cleanBase64 = frame.jpegBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(cleanBase64, 'base64');

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    return [];
  }

  // Detect faces
  const detectedFaces = await detectFacesInFrame(frame.jpegBase64);

  if (detectedFaces.length === 0) {
    return [];
  }

  // Crop each face
  const processedFaces: ProcessedFace[] = [];
  const frameId = `frame_${String(frameIndex + 1).padStart(4, '0')}`;

  for (const face of detectedFaces) {
    try {
      const cropped = await cropFaceFromImage(
        imageBuffer,
        face.boundingBox,
        metadata.width,
        metadata.height
      );

      processedFaces.push({
        timestampSec: frame.timestampSec,
        boundingBox: face.boundingBox,
        imageBase64: cropped.original,
        imageBase64ForEmbedding: cropped.forEmbedding,
        confidence: face.confidence,
        frameId,
      });
    } catch (error) {
      console.warn(
        `[processFrameForFaces] Failed to crop face at ${frame.timestampSec}s:`,
        error
      );
    }
  }

  return processedFaces;
}

/**
 * Detects and processes faces across all extracted frames.
 * Uses concurrent processing for better performance.
 *
 * @param frames - Array of extracted frames
 * @param onProgress - Optional progress callback
 * @returns Array of all processed faces
 *
 * @example
 * ```ts
 * const faces = await detectAndProcessFaces(extractedFrames);
 * console.log(`Found ${faces.length} total faces`);
 * ```
 */
export async function detectAndProcessFaces(
  frames: Array<{ timestampSec: number; jpegBase64: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<ProcessedFace[]> {
  if (frames.length === 0) {
    return [];
  }

  const total = frames.length;
  const allFaces: ProcessedFace[] = [];
  let completed = 0;
  let nextIndex = 0;

  // Process frames with concurrency pool
  const processNext = async (): Promise<void> => {
    while (nextIndex < total) {
      const currentIndex = nextIndex++;
      const frame = frames[currentIndex];

      try {
        const faces = await processFrameForFaces(frame, currentIndex);
        
        // Thread-safe push (JS is single-threaded, so this is safe)
        allFaces.push(...faces);
      } catch (error) {
        console.error(`[detectAndProcessFaces] Error processing frame ${currentIndex}:`, error);
        // Continue with other frames
      }

      completed++;
      if (onProgress) {
        onProgress(completed, total);
      }
    }
  };

  // Start concurrent workers
  const workers = Array(Math.min(REKOGNITION_CONCURRENCY, total))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);

  // Sort by timestamp for consistent ordering
  allFaces.sort((a, b) => a.timestampSec - b.timestampSec);

  console.log(`[detectAndProcessFaces] Found ${allFaces.length} faces in ${total} frames`);

  return allFaces;
}

/**
 * Deduplicates faces that appear in consecutive frames.
 * Uses IoU (Intersection over Union) to identify same faces.
 *
 * @param faces - Array of processed faces
 * @param iouThreshold - Minimum IoU to consider same face (0-1)
 * @param timeThreshold - Maximum time gap to consider consecutive (seconds)
 * @returns Deduplicated faces
 */
export function deduplicateFaces(
  faces: ProcessedFace[],
  iouThreshold: number = 0.5,
  timeThreshold: number = 10 // seconds
): ProcessedFace[] {
  if (faces.length <= 1) {
    return faces;
  }

  // Sort by timestamp
  const sorted = [...faces].sort((a, b) => a.timestampSec - b.timestampSec);
  const kept: ProcessedFace[] = [];

  for (const face of sorted) {
    // Check if this face overlaps with any kept face within time threshold
    const isDuplicate = kept.some((keptFace) => {
      // Only compare faces within time threshold
      if (Math.abs(face.timestampSec - keptFace.timestampSec) > timeThreshold) {
        return false;
      }

      const iou = calculateIoU(face.boundingBox, keptFace.boundingBox);
      return iou >= iouThreshold;
    });

    if (!isDuplicate) {
      kept.push(face);
    }
  }

  console.log(`[deduplicateFaces] Reduced ${faces.length} faces to ${kept.length} unique faces`);

  return kept;
}

/**
 * Calculates Intersection over Union (IoU) for two bounding boxes.
 */
function calculateIoU(box1: FaceBoundingBox, box2: FaceBoundingBox): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);

  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;
  const unionArea = box1Area + box2Area - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

// ============================================================================
// Legacy exports for backward compatibility
// ============================================================================

export type ClientDetectedFace = {
  timestampSec: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
};

export function filterValidFaces(faces: unknown[]): ClientDetectedFace[] {
  // For backward compatibility - filter client-detected faces
  return faces.filter((face): face is ClientDetectedFace => {
    if (typeof face !== 'object' || face === null) return false;
    const f = face as ClientDetectedFace;
    return (
      typeof f.timestampSec === 'number' &&
      typeof f.confidence === 'number' &&
      typeof f.boundingBox === 'object'
    );
  });
}

export async function processAllFaces(
  frames: Array<{ timestampSec: number; jpegBase64: string }>,
  clientFaces: ClientDetectedFace[]
): Promise<ProcessedFace[]> {
  // Legacy function - now uses server-side detection
  // If client faces are provided, we could use them, but prefer server detection
  return detectAndProcessFaces(frames);
}
