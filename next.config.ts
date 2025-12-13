import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Configuration for RCSQ video processing tool.
   */

  // Enable server external packages for ffmpeg, ffprobe and sharp
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe', 'sharp'],

  // Configure API route body size limit
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
