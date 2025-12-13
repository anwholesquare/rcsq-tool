/**
 * API Credentials Type Definitions
 *
 * Credentials can be provided directly in the API request or
 * resolved from environment variables using a secret_token.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * All API credentials required for the RCSQ pipeline.
 */
export interface ApiCredentials {
  /** OpenAI API key for Whisper, GPT models */
  openaiApiKey: string;
  /** Voyage AI API key for embeddings */
  voyageApiKey: string;
  /** AWS region for Rekognition (default: us-east-1) */
  awsRegion: string;
  /** AWS access key ID for Rekognition */
  awsAccessKeyId: string;
  /** AWS secret access key for Rekognition */
  awsSecretAccessKey: string;
}

/**
 * Partial credentials (all optional).
 * Used when some credentials may come from env via secret_token.
 */
export type PartialCredentials = Partial<ApiCredentials>;

// ============================================================================
// Environment Token
// ============================================================================

/**
 * Get the server secret token from environment.
 * This token allows authorized clients to use server-side credentials.
 */
export function getServerSecretToken(): string | undefined {
  return process.env.RCSQ_SECRET_TOKEN;
}

/**
 * Validates a client-provided secret token against the server token.
 */
export function isValidSecretToken(clientToken: string | undefined): boolean {
  const serverToken = getServerSecretToken();

  // If no server token is configured, secret_token feature is disabled
  if (!serverToken) {
    return false;
  }

  // Validate client token matches
  return clientToken === serverToken;
}

// ============================================================================
// Credential Resolution
// ============================================================================

/**
 * Resolves credentials from the request or environment.
 *
 * Priority:
 * 1. Credentials provided directly in the request
 * 2. If secret_token is valid, use environment variables
 * 3. Error if required credentials are missing
 *
 * @param provided - Credentials provided in the request
 * @param secretToken - Optional secret token to use env credentials
 * @param enableFaceDetection - Whether face detection is enabled (AWS required if true)
 * @returns Resolved credentials
 * @throws Error if required credentials are missing
 */
export function resolveCredentials(
  provided: PartialCredentials,
  secretToken?: string,
  enableFaceDetection: boolean = true
): ApiCredentials {
  const useEnv = isValidSecretToken(secretToken);

  // Resolve each credential
  const openaiApiKey = provided.openaiApiKey || (useEnv ? process.env.OPENAI_API_KEY : undefined);
  const voyageApiKey = provided.voyageApiKey || (useEnv ? process.env.VOYAGE_API_KEY : undefined);
  const awsRegion = provided.awsRegion || (useEnv ? process.env.AWS_REGION : undefined) || 'us-east-1';
  const awsAccessKeyId = provided.awsAccessKeyId || (useEnv ? process.env.AWS_ACCESS_KEY_ID : undefined);
  const awsSecretAccessKey = provided.awsSecretAccessKey || (useEnv ? process.env.AWS_SECRET_ACCESS_KEY : undefined);

  // Validate required credentials
  const missing: string[] = [];

  if (!openaiApiKey) missing.push('openaiApiKey (or OPENAI_API_KEY with valid secret_token)');
  if (!voyageApiKey) missing.push('voyageApiKey (or VOYAGE_API_KEY with valid secret_token)');

  // AWS credentials only required if face detection is enabled
  if (enableFaceDetection) {
    if (!awsAccessKeyId) missing.push('awsAccessKeyId (or AWS_ACCESS_KEY_ID with valid secret_token)');
    if (!awsSecretAccessKey) missing.push('awsSecretAccessKey (or AWS_SECRET_ACCESS_KEY with valid secret_token)');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required credentials: ${missing.join(', ')}`);
  }

  return {
    openaiApiKey: openaiApiKey!,
    voyageApiKey: voyageApiKey!,
    awsRegion,
    awsAccessKeyId: awsAccessKeyId || '',
    awsSecretAccessKey: awsSecretAccessKey || '',
  };
}

