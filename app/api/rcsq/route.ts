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
 * Credentials (provide ONE of the following):
 * Option 1: Direct credentials in form data
 * - openaiApiKey: OpenAI API key
 * - voyageApiKey: Voyage AI API key
 * - awsRegion: AWS region (optional, default: us-east-1)
 * - awsAccessKeyId: AWS access key ID (required if face detection enabled)
 * - awsSecretAccessKey: AWS secret access key (required if face detection enabled)
 *
 * Option 2: Use server-side credentials
 * - secret_token: Server token to use credentials from .env
 *
 * Face detection uses AWS Rekognition API.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { runRcsqPipeline } from '@/lib/pipeline/rcsqPipeline';
import { resolveCredentials, PartialCredentials } from '@/lib/credentials';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_FRAMES = 1000;

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
    // Extract optional parameters first (needed for validation)
    // =========================================================================
    const enableFaceDetection = formData.get('enableFaceDetection') !== 'false';
    
    // Optional: max_frame_limit (default: 1000)
    const maxFrameLimitStr = formData.get('max_frame_limit')?.toString();
    const maxFrameLimit = maxFrameLimitStr ? parseInt(maxFrameLimitStr, 10) : DEFAULT_MAX_FRAMES;
    
    // Optional: max_video_size in MB (default: 10 MB)
    const maxVideoSizeStr = formData.get('max_video_size')?.toString();
    const maxVideoSizeMB = maxVideoSizeStr ? parseFloat(maxVideoSizeStr) : (DEFAULT_MAX_FILE_SIZE_BYTES / 1024 / 1024);
    const maxVideoSizeBytes = maxVideoSizeMB * 1024 * 1024;

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

    // Check file size against custom or default limit
    if (file.size > maxVideoSizeBytes) {
      return errorResponse(
        `File size exceeds maximum allowed (${maxVideoSizeMB} MB)`,
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
    // Extract credentials from form data or use secret_token
    // =========================================================================
    const secretToken = formData.get('secret_token')?.toString();

    const providedCredentials: PartialCredentials = {
      openaiApiKey: formData.get('openaiApiKey')?.toString(),
      voyageApiKey: formData.get('voyageApiKey')?.toString(),
      awsRegion: formData.get('awsRegion')?.toString(),
      awsAccessKeyId: formData.get('awsAccessKeyId')?.toString(),
      awsSecretAccessKey: formData.get('awsSecretAccessKey')?.toString(),
    };

    // Resolve credentials (from request or env via secret_token)
    let credentials;
    try {
      credentials = resolveCredentials(providedCredentials, secretToken, enableFaceDetection);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid credentials';
      return errorResponse(message, 401);
    }

    // =========================================================================
    // Read file into Buffer
    // =========================================================================
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      `[api/rcsq] Processing: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, ${mimeType})`
    );
    console.log(`[api/rcsq] Face detection: ${enableFaceDetection ? 'enabled (AWS Rekognition)' : 'disabled'}`);
    console.log(`[api/rcsq] Credentials: ${secretToken ? 'via secret_token' : 'from request'}`);

    // =========================================================================
    // Run pipeline
    // =========================================================================
    console.log(`[api/rcsq] Max frame limit: ${maxFrameLimit}, Max video size: ${maxVideoSizeMB} MB`);
    
    const result = await runRcsqPipeline(
      {
        buffer,
        filename: file.name,
        mimeType,
        credentials,
        enableFaceDetection,
      },
      {
        frameIntervalSec: 5,  // Extract frame every 5 seconds
        maxFrames: maxFrameLimit,
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
