/**
 * RCSQ Video Processing API Route
 *
 * POST /api/rcsq
 *
 * Accepts a video file via multipart/form-data and returns
 * a JSON result with transcription, topics, frames, and faces.
 *
 * Form Fields:
 * - file: Video file (required, max 10MB)
 * - enableFaceDetection: 'true' or 'false' (optional, default: true)
 *
 * Face detection uses AWS Rekognition API.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { runRcsqPipeline } from '@/lib/pipeline/rcsqPipeline';

// ============================================================================
// Constants
// ============================================================================

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/x-matroska',
  'video/webm',
  'video/quicktime',
]);

// ============================================================================
// Error Response Helper
// ============================================================================

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // =========================================================================
    // Parse form data
    // =========================================================================
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse('Invalid form data', 400);
    }

    // =========================================================================
    // Extract and validate file
    // =========================================================================
    const file = formData.get('file');

    if (!file) {
      return errorResponse('Missing required field: file', 400);
    }

    if (!(file instanceof File)) {
      return errorResponse('Field "file" must be a file', 400);
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return errorResponse(
        `File size exceeds maximum allowed (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
        413
      );
    }

    // Check file size is not empty
    if (file.size === 0) {
      return errorResponse('File is empty', 400);
    }

    // Check MIME type
    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return errorResponse(
        `Unsupported file type: ${mimeType}. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
        415
      );
    }

    // =========================================================================
    // Check for optional face detection flag
    // =========================================================================
    const enableFaceDetection = formData.get('enableFaceDetection') !== 'false';

    // =========================================================================
    // Read file into Buffer
    // =========================================================================
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      `[api/rcsq] Processing: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, ${mimeType})`
    );
    console.log(`[api/rcsq] Face detection: ${enableFaceDetection ? 'enabled (AWS Rekognition)' : 'disabled'}`);

    // =========================================================================
    // Run pipeline
    // =========================================================================
    const result = await runRcsqPipeline(
      {
        buffer,
        filename: file.name,
        mimeType,
        enableFaceDetection,
      },
      {
        frameIntervalSec: 5,  // Extract frame every 5 seconds
        maxFrames: 1000,      // Max 1000 frames
        onProgress: (stage, percent) => {
          console.log(`[api/rcsq] ${stage}: ${percent}%`);
        },
      }
    );

    // =========================================================================
    // Return success response
    // =========================================================================
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[api/rcsq] Complete in ${processingTime}s`);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    // =========================================================================
    // Handle errors
    // =========================================================================
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api/rcsq] Pipeline error:', errorMessage);

    if (error instanceof Error && error.stack) {
      console.error('[api/rcsq] Stack trace:', error.stack);
    }

    return errorResponse(
      'Video processing failed. Please try again or contact support.',
      500
    );
  }
}

// ============================================================================
// Method Not Allowed Handler
// ============================================================================

export async function GET(): Promise<NextResponse> {
  return errorResponse('Method not allowed. Use POST.', 405);
}

export async function PUT(): Promise<NextResponse> {
  return errorResponse('Method not allowed. Use POST.', 405);
}

export async function DELETE(): Promise<NextResponse> {
  return errorResponse('Method not allowed. Use POST.', 405);
}

export async function PATCH(): Promise<NextResponse> {
  return errorResponse('Method not allowed. Use POST.', 405);
}

