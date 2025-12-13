/**
 * Health Check API Route
 *
 * POST /api/health
 *
 * Checks connectivity and configuration for all external services:
 * - OpenAI (Whisper, GPT models)
 * - Voyage AI (Embeddings)
 * - AWS Rekognition (Face detection)
 * - FFmpeg/FFprobe (Media processing)
 *
 * Credentials (provide ONE of the following):
 * Option 1: Direct credentials in JSON body
 * - openaiApiKey: OpenAI API key
 * - voyageApiKey: Voyage AI API key
 * - awsRegion: AWS region (optional, default: us-east-1)
 * - awsAccessKeyId: AWS access key ID
 * - awsSecretAccessKey: AWS secret access key
 *
 * Option 2: Use server-side credentials
 * - secret_token: Server token to use credentials from .env
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import OpenAI from 'openai';
import { RekognitionClient, DescribeProjectsCommand } from '@aws-sdk/client-rekognition';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { isValidSecretToken } from '@/lib/credentials';

// ============================================================================
// Types
// ============================================================================

interface ServiceStatus {
  status: 'ok' | 'error' | 'not_configured';
  message: string;
  latency_ms?: number;
  version?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    openai: ServiceStatus;
    voyage: ServiceStatus;
    aws_rekognition: ServiceStatus;
    ffmpeg: ServiceStatus;
    ffprobe: ServiceStatus;
  };
  environment: {
    node_version: string;
    platform: string;
  };
}

interface CredentialsInput {
  openaiApiKey?: string;
  voyageApiKey?: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  secret_token?: string;
}

// ============================================================================
// Credential Resolution
// ============================================================================

function resolveHealthCredentials(input: CredentialsInput) {
  const useEnv = isValidSecretToken(input.secret_token);

  return {
    openaiApiKey: input.openaiApiKey || (useEnv ? process.env.OPENAI_API_KEY : undefined),
    voyageApiKey: input.voyageApiKey || (useEnv ? process.env.VOYAGE_API_KEY : undefined),
    awsRegion: input.awsRegion || (useEnv ? process.env.AWS_REGION : undefined) || 'us-east-1',
    awsAccessKeyId: input.awsAccessKeyId || (useEnv ? process.env.AWS_ACCESS_KEY_ID : undefined),
    awsSecretAccessKey: input.awsSecretAccessKey || (useEnv ? process.env.AWS_SECRET_ACCESS_KEY : undefined),
  };
}

// ============================================================================
// Health Check Functions
// ============================================================================

/**
 * Check OpenAI API connection by listing models.
 */
async function checkOpenAI(apiKey?: string): Promise<ServiceStatus> {
  if (!apiKey) {
    return {
      status: 'not_configured',
      message: 'OpenAI API key not provided',
    };
  }

  const startTime = Date.now();

  try {
    const openai = new OpenAI({ apiKey });

    // Simple API call to verify connection
    const response = await openai.models.list();
    const latency = Date.now() - startTime;

    // Check if whisper model is available
    const hasWhisper = response.data.some((m) => m.id.includes('whisper'));

    return {
      status: 'ok',
      message: hasWhisper
        ? `Connected. ${response.data.length} models available, Whisper: yes`
        : `Connected. ${response.data.length} models available`,
      latency_ms: latency,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'error',
      message: `Connection failed: ${message}`,
      latency_ms: Date.now() - startTime,
    };
  }
}

/**
 * Check Voyage AI API connection.
 */
async function checkVoyage(apiKey?: string): Promise<ServiceStatus> {
  if (!apiKey) {
    return {
      status: 'not_configured',
      message: 'Voyage API key not provided',
    };
  }

  const startTime = Date.now();

  try {
    // Simple embedding request to verify connection
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: 'health check',
        model: 'voyage-3-large',
      }),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        status: 'error',
        message: `API error: ${response.status} - ${error.detail || error.message || 'Unknown'}`,
        latency_ms: latency,
      };
    }

    const data = await response.json();

    return {
      status: 'ok',
      message: `Connected. Model: ${data.model}, Dimension: ${data.data?.[0]?.embedding?.length || 'N/A'}`,
      latency_ms: latency,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'error',
      message: `Connection failed: ${message}`,
      latency_ms: Date.now() - startTime,
    };
  }
}

/**
 * Check AWS Rekognition API connection.
 */
async function checkAWSRekognition(
  accessKeyId?: string,
  secretAccessKey?: string,
  region: string = 'us-east-1'
): Promise<ServiceStatus> {
  if (!accessKeyId || !secretAccessKey) {
    return {
      status: 'not_configured',
      message: 'AWS credentials not provided',
    };
  }

  const startTime = Date.now();

  try {
    const client = new RekognitionClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Simple API call to verify credentials
    // DescribeProjects is a lightweight call that verifies permissions
    await client.send(new DescribeProjectsCommand({}));

    const latency = Date.now() - startTime;

    return {
      status: 'ok',
      message: `Connected. Region: ${region}`,
      latency_ms: latency,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const latency = Date.now() - startTime;

    // Check if it's an access denied error (credentials work but no project permissions)
    // This is actually OK for our use case since we only need DetectFaces
    if (message.includes('AccessDenied') && message.includes('DescribeProjects')) {
      return {
        status: 'ok',
        message: `Connected. Region: ${region} (DetectFaces permission assumed)`,
        latency_ms: latency,
      };
    }

    return {
      status: 'error',
      message: `Connection failed: ${message}`,
      latency_ms: latency,
    };
  }
}

/**
 * Check FFmpeg installation and version.
 */
async function checkFFmpeg(): Promise<ServiceStatus> {
  const ffmpegPath = ffmpegInstaller.path;

  if (!ffmpegPath) {
    return {
      status: 'error',
      message: 'FFmpeg binary not found',
    };
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const process = spawn(ffmpegPath, ['-version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.on('close', (code) => {
      const latency = Date.now() - startTime;

      if (code === 0) {
        // Extract version from output
        const versionMatch = stdout.match(/ffmpeg version (\S+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';

        resolve({
          status: 'ok',
          message: `Installed at: ${ffmpegPath}`,
          version,
          latency_ms: latency,
        });
      } else {
        resolve({
          status: 'error',
          message: `FFmpeg exited with code ${code}`,
          latency_ms: latency,
        });
      }
    });

    process.on('error', (err) => {
      resolve({
        status: 'error',
        message: `Failed to execute: ${err.message}`,
        latency_ms: Date.now() - startTime,
      });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      process.kill();
      resolve({
        status: 'error',
        message: 'Timeout waiting for FFmpeg',
        latency_ms: 5000,
      });
    }, 5000);
  });
}

/**
 * Check FFprobe installation and version.
 */
async function checkFFprobe(): Promise<ServiceStatus> {
  const ffprobePath = ffprobeInstaller.path;

  if (!ffprobePath) {
    return {
      status: 'error',
      message: 'FFprobe binary not found',
    };
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const process = spawn(ffprobePath, ['-version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.on('close', (code) => {
      const latency = Date.now() - startTime;

      if (code === 0) {
        // Extract version from output
        const versionMatch = stdout.match(/ffprobe version (\S+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';

        resolve({
          status: 'ok',
          message: `Installed at: ${ffprobePath}`,
          version,
          latency_ms: latency,
        });
      } else {
        resolve({
          status: 'error',
          message: `FFprobe exited with code ${code}`,
          latency_ms: latency,
        });
      }
    });

    process.on('error', (err) => {
      resolve({
        status: 'error',
        message: `Failed to execute: ${err.message}`,
        latency_ms: Date.now() - startTime,
      });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      process.kill();
      resolve({
        status: 'error',
        message: 'Timeout waiting for FFprobe',
        latency_ms: 5000,
      });
    }, 5000);
  });
}

// ============================================================================
// Route Handlers
// ============================================================================

async function runHealthCheck(credentials: ReturnType<typeof resolveHealthCredentials>): Promise<NextResponse> {
  // Run all checks in parallel
  const [openai, voyage, awsRekognition, ffmpeg, ffprobe] = await Promise.all([
    checkOpenAI(credentials.openaiApiKey),
    checkVoyage(credentials.voyageApiKey),
    checkAWSRekognition(credentials.awsAccessKeyId, credentials.awsSecretAccessKey, credentials.awsRegion),
    checkFFmpeg(),
    checkFFprobe(),
  ]);

  const services = {
    openai,
    voyage,
    aws_rekognition: awsRekognition,
    ffmpeg,
    ffprobe,
  };

  // Determine overall status
  const statuses = Object.values(services).map((s) => s.status);
  const hasError = statuses.some((s) => s === 'error');
  const hasNotConfigured = statuses.some((s) => s === 'not_configured');

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (hasError) {
    overallStatus = 'unhealthy';
  } else if (hasNotConfigured) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services,
    environment: {
      node_version: process.version,
      platform: process.platform,
    },
  };

  // Return appropriate HTTP status code
  const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return NextResponse.json(response, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * POST /api/health
 * Health check with credentials in JSON body
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const credentials = resolveHealthCredentials(body);
    return runHealthCheck(credentials);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 }
    );
  }
}

/**
 * GET /api/health
 * Health check with credentials from query params or secret_token
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  const input: CredentialsInput = {
    openaiApiKey: searchParams.get('openaiApiKey') || undefined,
    voyageApiKey: searchParams.get('voyageApiKey') || undefined,
    awsRegion: searchParams.get('awsRegion') || undefined,
    awsAccessKeyId: searchParams.get('awsAccessKeyId') || undefined,
    awsSecretAccessKey: searchParams.get('awsSecretAccessKey') || undefined,
    secret_token: searchParams.get('secret_token') || undefined,
  };

  const credentials = resolveHealthCredentials(input);
  return runHealthCheck(credentials);
}
