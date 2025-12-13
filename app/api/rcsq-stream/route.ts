/**
 * RCSQ Streaming API Route
 *
 * POST /api/rcsq-stream
 *
 * Streams progress updates via Server-Sent Events while processing.
 */

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

import { NextRequest } from 'next/server';
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
// POST Handler with SSE
// ============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const sendProgress = (stage: string, percent: number, details?: string) => {
        sendEvent('progress', { stage, percent, details, timestamp: Date.now() });
      };

      const sendError = (message: string) => {
        sendEvent('error', { message, timestamp: Date.now() });
        controller.close();
      };

      const sendComplete = async (result: unknown) => {
        sendEvent('complete', { result, timestamp: Date.now() });
        // Small delay to ensure the event is flushed before closing
        await new Promise(resolve => setTimeout(resolve, 100));
        controller.close();
      };

      try {
        // =====================================================================
        // Parse form data
        // =====================================================================
        sendProgress('Parsing request', 0, 'Reading form data...');

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          sendError('Invalid form data');
          return;
        }

        // =====================================================================
        // Extract and validate file
        // =====================================================================
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
          sendError('Missing required field: file');
          return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          sendError(`File size exceeds maximum (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`);
          return;
        }

        if (file.size === 0) {
          sendError('File is empty');
          return;
        }

        const mimeType = file.type || 'application/octet-stream';
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
          sendError(`Unsupported file type: ${mimeType}`);
          return;
        }

        // =====================================================================
        // Extract options and credentials
        // =====================================================================
        const enableFaceDetection = formData.get('enableFaceDetection') !== 'false';
        const secretToken = formData.get('secret_token')?.toString();

        const providedCredentials: PartialCredentials = {
          openaiApiKey: formData.get('openaiApiKey')?.toString(),
          voyageApiKey: formData.get('voyageApiKey')?.toString(),
          awsRegion: formData.get('awsRegion')?.toString(),
          awsAccessKeyId: formData.get('awsAccessKeyId')?.toString(),
          awsSecretAccessKey: formData.get('awsSecretAccessKey')?.toString(),
        };

        let credentials;
        try {
          credentials = resolveCredentials(providedCredentials, secretToken, enableFaceDetection);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid credentials';
          sendError(message);
          return;
        }

        // =====================================================================
        // Read file into Buffer
        // =====================================================================
        sendProgress('Uploading', 10, `Reading ${file.name}...`);
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        sendProgress('Uploading', 100, `File uploaded: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

        // =====================================================================
        // Run pipeline with progress callback
        // =====================================================================
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
            onProgress: (stage, percent) => {
              // Map internal stages to user-friendly names
              const stageMap: Record<string, string> = {
                'Initializing': 'Initializing pipeline',
                'Extracting metadata': 'Analyzing video metadata',
                'Extracting audio': 'Extracting audio track',
                'Transcribing': 'Transcribing with Whisper',
                'Processing segments': 'Embedding transcript segments',
                'Extracting topics': 'Extracting topics with GPT',
                'Extracting frames': 'Extracting video frames',
                'Processing frames': 'Captioning & embedding frames',
                'Detecting faces': 'Detecting faces with Rekognition',
                'Finalizing': 'Finalizing results',
              };

              const friendlyStage = stageMap[stage] || stage;
              sendProgress(friendlyStage, percent);
            },
          }
        );

        await sendComplete(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendError(`Processing failed: ${message}`);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

