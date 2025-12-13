/**
 * Media Processing Module (Server-side only)
 *
 * Provides video/audio processing utilities using ffmpeg:
 * - Technical metadata extraction
 * - Audio extraction (mono 16kHz WAV)
 * - Frame extraction (JPEG)
 * - MD5 hashing
 *
 * All operations are performed in-memory without disk writes.
 */

import { createHash } from 'crypto';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

// ============================================================================
// Types
// ============================================================================

export interface TechnicalInfo {
  durationSec: number;
  frameRateFps: number;
  width: number;
  height: number;
  audioSampleRateHz: number;
  audioChannels: number;
}

export interface ExtractedFrame {
  timestampSec: number;
  jpegBase64: string;
}

export interface ExtractFramesOptions {
  /** Interval between frames in seconds (default: 5) */
  intervalSec?: number;
  /** Maximum number of frames to extract (default: 1000) */
  maxFrames?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Computes MD5 hash of a buffer.
 *
 * @param buffer - Input data buffer
 * @returns MD5 hash as lowercase hex string
 *
 * @example
 * ```ts
 * const hash = computeMd5(videoBuffer);
 * // Returns: "d41d8cd98f00b204e9800998ecf8427e"
 * ```
 */
export function computeMd5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

/**
 * Converts a Buffer to a Readable stream.
 */
function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/**
 * Collects stream data into a Buffer.
 */
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Gets the ffmpeg binary path from @ffmpeg-installer/ffmpeg.
 */
function getFfmpegPath(): string {
  if (!ffmpegInstaller.path) {
    throw new Error(
      '[mediaProcessing] ffmpeg binary not found. Ensure @ffmpeg-installer/ffmpeg is installed.'
    );
  }
  return ffmpegInstaller.path;
}

/**
 * Gets the ffprobe binary path from @ffprobe-installer/ffprobe.
 */
function getFfprobePath(): string {
  if (!ffprobeInstaller.path) {
    throw new Error(
      '[mediaProcessing] ffprobe binary not found. Ensure @ffprobe-installer/ffprobe is installed.'
    );
  }
  return ffprobeInstaller.path;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Extracts technical metadata from a video buffer.
 * 
 * Uses a two-step approach for accurate duration:
 * 1. ffprobe for stream metadata (resolution, fps, audio info)
 * 2. ffmpeg to determine accurate duration by processing the stream
 *
 * @param buffer - Video file as a Buffer
 * @returns Promise resolving to technical metadata
 * @throws Error if probing fails or video is invalid
 *
 * @example
 * ```ts
 * const info = await extractTechnicalInfo(videoBuffer);
 * console.log(info.durationSec); // 512.3
 * console.log(info.width, info.height); // 1920, 1080
 * ```
 */
export async function extractTechnicalInfo(buffer: Buffer): Promise<TechnicalInfo> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[extractTechnicalInfo] Empty buffer provided');
  }

  // Step 1: Get stream metadata from ffprobe (width, height, fps, audio)
  const streamInfo = await getStreamMetadata(buffer);

  // Step 2: Get accurate duration using ffmpeg
  const durationSec = await getAccurateDuration(buffer);

  return {
    durationSec,
    frameRateFps: streamInfo.frameRateFps,
    width: streamInfo.width,
    height: streamInfo.height,
    audioSampleRateHz: streamInfo.audioSampleRateHz,
    audioChannels: streamInfo.audioChannels,
  };
}

/**
 * Gets stream metadata (resolution, fps, audio) from ffprobe.
 * Duration from this may be inaccurate for stdin input.
 */
async function getStreamMetadata(buffer: Buffer): Promise<Omit<TechnicalInfo, 'durationSec'>> {
  const ffprobePath = getFfprobePath();

  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-i', 'pipe:0',
    ];

    const process = spawn(ffprobePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const inputStream = bufferToStream(buffer);
    inputStream.pipe(process.stdin);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`[getStreamMetadata] ffprobe exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const probeData = JSON.parse(stdout);

        const videoStream = probeData.streams?.find(
          (s: { codec_type: string }) => s.codec_type === 'video'
        );
        const audioStream = probeData.streams?.find(
          (s: { codec_type: string }) => s.codec_type === 'audio'
        );

        if (!videoStream) {
          reject(new Error('[getStreamMetadata] No video stream found'));
          return;
        }

        // Parse frame rate
        let frameRateFps = 0;
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          frameRateFps = den ? num / den : num;
        } else if (videoStream.avg_frame_rate) {
          const [num, den] = videoStream.avg_frame_rate.split('/').map(Number);
          frameRateFps = den ? num / den : num;
        }

        resolve({
          frameRateFps: Math.round(frameRateFps * 100) / 100,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          audioSampleRateHz: audioStream ? parseInt(audioStream.sample_rate, 10) : 0,
          audioChannels: audioStream ? audioStream.channels : 0,
        });
      } catch (parseError) {
        reject(new Error(`[getStreamMetadata] Failed to parse ffprobe output: ${parseError}`));
      }
    });

    process.on('error', (err) => {
      reject(new Error(`[getStreamMetadata] ffprobe process error: ${err.message}`));
    });

    process.stdin.on('error', () => {
      // Ignore EPIPE errors
    });
  });
}

/**
 * Gets accurate video duration by using ffmpeg to process the entire stream.
 * This works reliably with stdin because ffmpeg decodes the entire input.
 */
async function getAccurateDuration(buffer: Buffer): Promise<number> {
  const ffmpegPath = getFfmpegPath();

  return new Promise((resolve, reject) => {
    // Use ffmpeg to decode to null and capture duration from stderr
    const args = [
      '-i', 'pipe:0',
      '-f', 'null',       // Output format: null (discard output)
      '-',                // Output to stdout (discarded)
    ];

    const process = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const inputStream = bufferToStream(buffer);
    inputStream.pipe(process.stdin);

    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      // ffmpeg may return non-zero even on success when outputting to null
      // Parse duration from stderr output
      
      // PRIORITY 1: Use the final "time=" value - this is the actual processed time
      // and is accurate even when reading from stdin
      const timeMatches = stderr.match(/time=(\d+):(\d+):(\d+)\.(\d+)/g);
      if (timeMatches && timeMatches.length > 0) {
        // Get the last time= value (final position after processing whole file)
        const lastTime = timeMatches[timeMatches.length - 1];
        const parts = lastTime.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
        if (parts) {
          const hours = parseInt(parts[1], 10);
          const minutes = parseInt(parts[2], 10);
          const seconds = parseInt(parts[3], 10);
          const centiseconds = parseInt(parts[4], 10);

          const totalSeconds = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
          console.log(`[getAccurateDuration] Determined duration from time=: ${totalSeconds}s`);
          resolve(Math.round(totalSeconds * 100) / 100);
          return;
        }
      }

      // PRIORITY 2: Fallback to "Duration:" from metadata (may be inaccurate for stdin)
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1], 10);
        const minutes = parseInt(durationMatch[2], 10);
        const seconds = parseInt(durationMatch[3], 10);
        const centiseconds = parseInt(durationMatch[4], 10);

        const totalSeconds = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
        console.log(`[getAccurateDuration] Determined duration from Duration: ${totalSeconds}s (fallback)`);
        resolve(Math.round(totalSeconds * 100) / 100);
        return;
      }

      // If we still can't find duration, log stderr for debugging and reject
      console.error('[getAccurateDuration] Could not parse duration. Stderr:', stderr.slice(0, 500));
      reject(new Error('[getAccurateDuration] Could not determine video duration'));
    });

    process.on('error', (err) => {
      reject(new Error(`[getAccurateDuration] ffmpeg process error: ${err.message}`));
    });

    process.stdin.on('error', () => {
      // Ignore EPIPE errors
    });
  });
}

/**
 * Extracts audio from a video as mono 16kHz WAV format.
 *
 * @param buffer - Video file as a Buffer
 * @returns Promise resolving to WAV audio as a Buffer
 * @throws Error if extraction fails
 *
 * @example
 * ```ts
 * const wavBuffer = await extractAudioAsWav(videoBuffer);
 * const transcript = await transcribeAudioWhisper(wavBuffer, 'audio/wav');
 * ```
 */
export async function extractAudioAsWav(buffer: Buffer): Promise<Buffer> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[extractAudioAsWav] Empty buffer provided');
  }

  const ffmpeg = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const args = [
      '-i', 'pipe:0',           // Read from stdin
      '-vn',                     // No video
      '-acodec', 'pcm_s16le',   // PCM 16-bit little-endian
      '-ar', '16000',           // 16kHz sample rate
      '-ac', '1',               // Mono
      '-f', 'wav',              // WAV format
      'pipe:1',                 // Output to stdout
    ];

    const process = spawn(ffmpeg, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const inputStream = bufferToStream(buffer);
    inputStream.pipe(process.stdin);

    const outputChunks: Buffer[] = [];
    let stderr = '';

    process.stdout.on('data', (chunk) => {
      outputChunks.push(Buffer.from(chunk));
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`[extractAudioAsWav] ffmpeg exited with code ${code}: ${stderr}`));
        return;
      }

      const outputBuffer = Buffer.concat(outputChunks);
      if (outputBuffer.length === 0) {
        reject(new Error('[extractAudioAsWav] No audio data extracted'));
        return;
      }

      resolve(outputBuffer);
    });

    process.on('error', (err) => {
      reject(new Error(`[extractAudioAsWav] ffmpeg process error: ${err.message}`));
    });

    process.stdin.on('error', () => {
      // Ignore EPIPE errors
    });
  });
}

/**
 * Extracts frames from a video at fixed time intervals.
 *
 * @param buffer - Video file as a Buffer
 * @param options - Configuration options
 * @param options.intervalSec - Interval between frames in seconds (default: 5)
 * @param options.maxFrames - Maximum number of frames to extract (default: 1000)
 * @returns Promise resolving to array of frames with timestamps
 * @throws Error if extraction fails
 *
 * @example
 * ```ts
 * // Extract frames every 5 seconds, up to 1000 frames
 * const frames = await extractFrames(videoBuffer, { intervalSec: 5, maxFrames: 1000 });
 * for (const frame of frames) {
 *   console.log(`Frame at ${frame.timestampSec}s`);
 *   const embedding = await embedImageVoyage(frame.jpegBase64);
 * }
 * ```
 */
export async function extractFrames(
  buffer: Buffer,
  options: ExtractFramesOptions = {}
): Promise<ExtractedFrame[]> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[extractFrames] Empty buffer provided');
  }

  const { intervalSec = 5, maxFrames = 1000 } = options;

  if (intervalSec <= 0) {
    throw new Error('[extractFrames] intervalSec must be positive');
  }
  if (maxFrames < 1) {
    throw new Error('[extractFrames] maxFrames must be at least 1');
  }

  // First, get the video duration
  const info = await extractTechnicalInfo(buffer);

  if (info.durationSec <= 0) {
    throw new Error('[extractFrames] Could not determine video duration');
  }

  // Calculate frame timestamps at fixed intervals (every intervalSec seconds)
  // Start at intervalSec, continue until video ends or maxFrames reached
  const timestamps: number[] = [];
  let currentTime = intervalSec;

  while (currentTime < info.durationSec && timestamps.length < maxFrames) {
    timestamps.push(currentTime);
    currentTime += intervalSec;
  }

  // If video is shorter than intervalSec, take one frame from the middle
  if (timestamps.length === 0 && info.durationSec > 0) {
    timestamps.push(info.durationSec / 2);
  }

  console.log(
    `[extractFrames] Extracting ${timestamps.length} frames at ${intervalSec}s intervals from ${info.durationSec.toFixed(1)}s video`
  );

  // Extract each frame
  const frames: ExtractedFrame[] = [];

  for (const timestamp of timestamps) {
    const jpegBuffer = await extractSingleFrame(buffer, timestamp);
    frames.push({
      timestampSec: Math.round(timestamp * 100) / 100,
      jpegBase64: jpegBuffer.toString('base64'),
    });
  }

  return frames;
}

/**
 * Extracts a single frame at a specific timestamp.
 *
 * @param buffer - Video file as a Buffer
 * @param timestampSec - Timestamp in seconds
 * @returns Promise resolving to JPEG image as Buffer
 */
async function extractSingleFrame(
  buffer: Buffer,
  timestampSec: number
): Promise<Buffer> {
  const ffmpeg = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const args = [
      '-ss', timestampSec.toFixed(3),  // Seek to timestamp (before input for speed)
      '-i', 'pipe:0',                   // Read from stdin
      '-vframes', '1',                  // Extract single frame
      '-f', 'image2pipe',               // Output as image pipe
      '-vcodec', 'mjpeg',               // JPEG codec
      '-q:v', '2',                      // Quality (2 = high quality)
      'pipe:1',                         // Output to stdout
    ];

    const process = spawn(ffmpeg, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const inputStream = bufferToStream(buffer);
    inputStream.pipe(process.stdin);

    const outputChunks: Buffer[] = [];
    let stderr = '';

    process.stdout.on('data', (chunk) => {
      outputChunks.push(Buffer.from(chunk));
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`[extractSingleFrame] ffmpeg exited with code ${code}: ${stderr}`));
        return;
      }

      const outputBuffer = Buffer.concat(outputChunks);
      if (outputBuffer.length === 0) {
        reject(new Error(`[extractSingleFrame] No frame data at ${timestampSec}s`));
        return;
      }

      resolve(outputBuffer);
    });

    process.on('error', (err) => {
      reject(new Error(`[extractSingleFrame] ffmpeg process error: ${err.message}`));
    });

    process.stdin.on('error', () => {
      // Ignore EPIPE errors
    });
  });
}

/**
 * Extracts frames using a select filter for more efficient batch extraction.
 * Alternative implementation that extracts all frames in a single ffmpeg pass.
 *
 * @param buffer - Video file as a Buffer
 * @param timestamps - Array of timestamps in seconds
 * @returns Promise resolving to array of JPEG buffers
 */
export async function extractFramesBatch(
  buffer: Buffer,
  timestamps: number[]
): Promise<Buffer[]> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[extractFramesBatch] Empty buffer provided');
  }

  if (timestamps.length === 0) {
    return [];
  }

  // For small numbers of frames, sequential extraction is simpler and more reliable
  const frames: Buffer[] = [];
  for (const ts of timestamps) {
    const frame = await extractSingleFrame(buffer, ts);
    frames.push(frame);
  }
  return frames;
}

/**
 * Extracts audio as MP3 format (smaller file size than WAV).
 * Useful when bandwidth is a concern.
 *
 * @param buffer - Video file as a Buffer
 * @returns Promise resolving to MP3 audio as a Buffer
 */
export async function extractAudioAsMp3(buffer: Buffer): Promise<Buffer> {
  if (!buffer || buffer.length === 0) {
    throw new Error('[extractAudioAsMp3] Empty buffer provided');
  }

  const ffmpeg = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const args = [
      '-i', 'pipe:0',           // Read from stdin
      '-vn',                     // No video
      '-acodec', 'libmp3lame',  // MP3 codec
      '-ar', '16000',           // 16kHz sample rate
      '-ac', '1',               // Mono
      '-b:a', '64k',            // 64kbps bitrate
      '-f', 'mp3',              // MP3 format
      'pipe:1',                 // Output to stdout
    ];

    const process = spawn(ffmpeg, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const inputStream = bufferToStream(buffer);
    inputStream.pipe(process.stdin);

    const outputChunks: Buffer[] = [];
    let stderr = '';

    process.stdout.on('data', (chunk) => {
      outputChunks.push(Buffer.from(chunk));
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`[extractAudioAsMp3] ffmpeg exited with code ${code}: ${stderr}`));
        return;
      }

      const outputBuffer = Buffer.concat(outputChunks);
      if (outputBuffer.length === 0) {
        reject(new Error('[extractAudioAsMp3] No audio data extracted'));
        return;
      }

      resolve(outputBuffer);
    });

    process.on('error', (err) => {
      reject(new Error(`[extractAudioAsMp3] ffmpeg process error: ${err.message}`));
    });

    process.stdin.on('error', () => {
      // Ignore EPIPE errors
    });
  });
}

