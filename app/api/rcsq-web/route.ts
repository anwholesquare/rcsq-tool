/**
 * RCSQ Web API Route
 *
 * POST /api/rcsq-web
 *
 * A thin wrapper around the main /api/rcsq endpoint for the web UI.
 * Forwards the request and returns the same response.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { runRcsqPipeline } from '@/lib/pipeline/rcsqPipeline';
import { resolveCredentials, PartialCredentials } from '@/lib/credentials';

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
      `[api/rcsq-web] Processing: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, ${mimeType})`
    );

    // =========================================================================
    // Run pipeline
    // =========================================================================
    const result = await runRcsqPipeline(
      {
        buffer,
        filename: file.name,
        mimeType,
        credentials,
        enableFaceDetection,
      },
      {
        frameIntervalSec: 5,
        maxFrames: 1000,
      }
    );

    // =========================================================================
    // Return success response
    // =========================================================================
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[api/rcsq-web] Complete in ${processingTime}s`);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api/rcsq-web] Pipeline error:', errorMessage);

    return errorResponse(
      `Processing failed: ${errorMessage}`,
      500
    );
  }
}

