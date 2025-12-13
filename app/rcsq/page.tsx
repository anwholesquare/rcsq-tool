'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Key,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  FileVideo,
  Clock,
  Film,
  MessageSquare,
  User,
  X,
  Info,
  Cpu,
  DollarSign,
  Hash,
  Calendar,
  Layers,
  Image as ImageIcon,
  Mic,
  Eye,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avgLogprob: number;
}

interface Segment {
  segment_id: number;
  rcsq_video_id: string;
  time: { start_sec: number; end_sec: number };
  transcript: { text: string; avg_confidence: number };
  text_embedding: { model: string; vector: number[] };
}

interface Topic {
  topic_id: string;
  rcsq_video_id: string;
  label: string;
  description: string;
  summary: { text: string; model: string };
  segment_ids: string[];
}

interface Frame {
  frame_id: string;
  rcsq_video_id: string;
  time: { timestamp_sec: number };
  image: { encoding: string; data_base64: string };
  caption: { text: string };
  image_embedding: { model: string; vector: number[] };
}

interface Face {
  face_id: string;
  rcsq_video_id: string;
  frame_id: string;
  time: { timestamp_sec: number };
  image: { encoding: string; data_base64: string };
  face_embedding: { model: string; vector: number[] };
}

interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

interface UsageStats {
  models: ModelUsage[];
  total_tokens: number;
  total_estimated_cost_usd: number;
}

interface RcsqResult {
  tool: string;
  version: string;
  created_at: string;
  video: {
    source: { filename: string; filesize_bytes: number; mime_type: string };
    technical: {
      duration_sec: number;
      frame_rate_fps: number;
      width: number;
      height: number;
      audio_sample_rate_hz: number;
      audio_channels: number;
    };
    hashes: { md5: string };
    rcsq_video_id: string;
  };
  models: {
    transcription: { provider: string; name: string; language: string };
    segment_summarisation: { provider: string; name: string };
    topic_extraction: { provider: string; name: string };
    text_embedding: { provider: string; name: string; dimension: number };
    image_embedding: { provider: string; name: string; dimension: number };
    captioning: { provider: string; name: string };
    face_detection: { provider: string; name: string };
  };
  segments: Segment[];
  topics: Topic[];
  frames: Frame[];
  faces: Face[];
  stats: {
    total_segments: number;
    total_topics: number;
    total_frames: number;
    total_faces: number;
    processing_time_sec: number;
    usage?: UsageStats;
  };
}

interface ProgressEvent {
  stage: string;
  percent: number;
  details?: string;
  timestamp: number;
}

type AuthMode = 'token' | 'keys';
type ProcessingState = 'idle' | 'processing' | 'complete' | 'error';
type ResultTab = 'overview' | 'segments' | 'topics' | 'frames' | 'faces' | 'models' | 'costs';

// ============================================================================
// Constants
// ============================================================================

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}

function formatCost(cost: number): string {
  if (cost < 0.0001) return '< $0.0001';
  return `$${cost.toFixed(4)}`;
}

// ============================================================================
// Component
// ============================================================================

export default function RcsqPage() {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [file, setFile] = useState<File | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('token');
  const [secretToken, setSecretToken] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [voyageKey, setVoyageKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [enableFaceDetection, setEnableFaceDetection] = useState(true);

  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RcsqResult | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [resultTab, setResultTab] = useState<ResultTab>('overview');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Timer Effect
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (processingState === 'processing') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [processingState]);

  // -------------------------------------------------------------------------
  // Auto-scroll progress log
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (progressContainerRef.current) {
      progressContainerRef.current.scrollTop = progressContainerRef.current.scrollHeight;
    }
  }, [progressLog]);

  // -------------------------------------------------------------------------
  // Warn on Close
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (processingState === 'processing') {
        e.preventDefault();
        e.returnValue = 'Video processing is in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [processingState]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!ACCEPTED_VIDEO_TYPES.includes(selectedFile.type)) {
      setError(`Invalid file type. Accepted: MP4, WebM, MOV, MKV`);
      setFile(null);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB`);
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setProcessingState('idle');
    setProgressLog([]);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProgressLog([]);
    setCurrentProgress(null);

    if (!file) {
      setError('Please select a video file');
      return;
    }

    // Validate credentials
    if (authMode === 'token' && !secretToken.trim()) {
      setError('Please enter a secret token');
      return;
    }

    if (authMode === 'keys') {
      if (!openaiKey.trim()) {
        setError('OpenAI API key is required');
        return;
      }
      if (!voyageKey.trim()) {
        setError('Voyage API key is required');
        return;
      }
      if (enableFaceDetection && (!awsAccessKeyId.trim() || !awsSecretAccessKey.trim())) {
        setError('AWS credentials are required for face detection');
        return;
      }
    }

    // Build form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('enableFaceDetection', String(enableFaceDetection));

    if (authMode === 'token') {
      formData.append('secret_token', secretToken);
    } else {
      formData.append('openaiApiKey', openaiKey);
      formData.append('voyageApiKey', voyageKey);
      if (enableFaceDetection) {
        formData.append('awsRegion', awsRegion);
        formData.append('awsAccessKeyId', awsAccessKeyId);
        formData.append('awsSecretAccessKey', awsSecretAccessKey);
      }
    }

    // Start processing with SSE
    setProcessingState('processing');
    setElapsedTime(0);

    try {
      const response = await fetch('/api/rcsq-stream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Helper to process SSE events from text
      const processSSE = (text: string) => {
        // Split by double newline (SSE event separator)
        const events = text.split('\n\n');
        
        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          
          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }
          
          if (eventType && eventData) {
            try {
              const data = JSON.parse(eventData);
              
              if (eventType === 'progress') {
                const progress: ProgressEvent = data;
                setCurrentProgress(progress);
                setProgressLog((prev) => [...prev, progress]);
              } else if (eventType === 'complete') {
                console.log('[SSE] Received complete event');
                setResult(data.result);
                setProcessingState('complete');
              } else if (eventType === 'error') {
                throw new Error(data.message);
              }
            } catch (parseError) {
              console.warn('[SSE] Parse error:', parseError);
            }
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete events (separated by double newline)
          const lastDoubleNewline = buffer.lastIndexOf('\n\n');
          if (lastDoubleNewline !== -1) {
            const completeData = buffer.slice(0, lastDoubleNewline + 2);
            buffer = buffer.slice(lastDoubleNewline + 2);
            processSSE(completeData);
          }
        }
        
        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            processSSE(buffer);
          }
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(message);
      setProcessingState('error');
    }
  }, [file, authMode, secretToken, openaiKey, voyageKey, awsRegion, awsAccessKeyId, awsSecretAccessKey, enableFaceDetection]);

  const handleDownload = useCallback(() => {
    if (!result) return;

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rcsq-result-${result.video.rcsq_video_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const handleReset = useCallback(() => {
    setFile(null);
    setResult(null);
    setProcessingState('idle');
    setError(null);
    setElapsedTime(0);
    setProgressLog([]);
    setCurrentProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // -------------------------------------------------------------------------
  // Derived State
  // -------------------------------------------------------------------------
  const isProcessing = processingState === 'processing';
  const canSubmit = file && !isProcessing && (
    (authMode === 'token' && secretToken.trim()) ||
    (authMode === 'keys' && openaiKey.trim() && voyageKey.trim() && 
      (!enableFaceDetection || (awsAccessKeyId.trim() && awsSecretAccessKey.trim())))
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">RCSQ Tool</h1>
              <p className="text-sm text-gray-500">Video Preprocessing for Research</p>
            </div>
            <Badge variant="outline" className="font-mono">v1.0.0</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Upload Form */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Card */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5 text-blue-600" />
                  Upload Video
                </CardTitle>
                <CardDescription>
                  Select a video file to process (max {MAX_FILE_SIZE_MB} MB)
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* File Input */}
                  <div
                    className={`
                      relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                      ${file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
                      ${isProcessing ? 'pointer-events-none opacity-50' : ''}
                    `}
                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_VIDEO_TYPES.join(',')}
                      onChange={handleFileChange}
                      disabled={isProcessing}
                      className="hidden"
                    />
                    
                    {file ? (
                      <div className="space-y-1">
                        <FileVideo className="h-8 w-8 mx-auto text-blue-600" />
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="h-8 w-8 mx-auto text-gray-400" />
                        <p className="text-sm text-gray-600">Click to upload</p>
                        <p className="text-xs text-gray-400">MP4, WebM, MOV, MKV</p>
                      </div>
                    )}
                  </div>

                  {/* Auth Mode */}
                  <Tabs value={authMode} onValueChange={(v) => setAuthMode(v as AuthMode)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="token" disabled={isProcessing}>
                        <Key className="h-3 w-3 mr-1" />
                        Token
                      </TabsTrigger>
                      <TabsTrigger value="keys" disabled={isProcessing}>
                        <Key className="h-3 w-3 mr-1" />
                        API Keys
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="token" className="mt-3 space-y-3">
                      <div>
                        <Label htmlFor="secretToken" className="text-xs text-gray-600">Secret Token</Label>
                        <Input
                          id="secretToken"
                          type="password"
                          placeholder="Enter token"
                          value={secretToken}
                          onChange={(e) => setSecretToken(e.target.value)}
                          disabled={isProcessing}
                          className="mt-1"
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="keys" className="mt-3 space-y-3">
                      <div>
                        <Label htmlFor="openaiKey" className="text-xs text-gray-600">OpenAI API Key *</Label>
                        <Input
                          id="openaiKey"
                          type="password"
                          placeholder="sk-..."
                          value={openaiKey}
                          onChange={(e) => setOpenaiKey(e.target.value)}
                          disabled={isProcessing}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="voyageKey" className="text-xs text-gray-600">Voyage API Key *</Label>
                        <Input
                          id="voyageKey"
                          type="password"
                          placeholder="pa-..."
                          value={voyageKey}
                          onChange={(e) => setVoyageKey(e.target.value)}
                          disabled={isProcessing}
                          className="mt-1"
                        />
                      </div>

                      <div className="pt-2 border-t">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableFaceDetection}
                            onChange={(e) => setEnableFaceDetection(e.target.checked)}
                            disabled={isProcessing}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">Face Detection (AWS)</span>
                        </label>

                        {enableFaceDetection && (
                          <div className="mt-2 space-y-2 pl-6">
                            <div>
                              <Label className="text-xs text-gray-500">AWS Region</Label>
                              <Input
                                type="text"
                                value={awsRegion}
                                onChange={(e) => setAwsRegion(e.target.value)}
                                disabled={isProcessing}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Access Key ID *</Label>
                              <Input
                                type="password"
                                placeholder="AKIA..."
                                value={awsAccessKeyId}
                                onChange={(e) => setAwsAccessKeyId(e.target.value)}
                                disabled={isProcessing}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Secret Access Key *</Label>
                              <Input
                                type="password"
                                value={awsSecretAccessKey}
                                onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                                disabled={isProcessing}
                                className="mt-1"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Error */}
                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Submit */}
                  <Button type="submit" disabled={!canSubmit} className="w-full">
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Cpu className="h-4 w-4 mr-2" />
                        Process Video
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Progress Log */}
            {(isProcessing || progressLog.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                      Processing Log
                    </span>
                    <Badge variant="outline" className="font-mono">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTime(elapsedTime)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {currentProgress && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{currentProgress.stage}</span>
                        <span className="text-gray-500">{currentProgress.percent}%</span>
                      </div>
                      <Progress value={currentProgress.percent} className="h-2" />
                    </div>
                  )}

                  <div
                    ref={progressContainerRef}
                    className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs bg-gray-50 rounded p-2"
                  >
                    {progressLog.map((log, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-gray-400 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-gray-700">{log.stage}</span>
                        <span className="text-blue-600">{log.percent}%</span>
                        {log.details && <span className="text-gray-500">{log.details}</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Results */}
          <div className="lg:col-span-2">
            {processingState === 'complete' && result ? (
              <div className="space-y-4">
                {/* Success Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Processing Complete</span>
                    <Badge variant="secondary">
                      {(result.stats?.processing_time_sec ?? 0).toFixed(1)}s
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                    <Button size="sm" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-1" />
                      Download JSON
                    </Button>
                  </div>
                </div>

                {/* Result Tabs */}
                <Tabs value={resultTab} onValueChange={(v) => setResultTab(v as ResultTab)}>
                  <TabsList className="grid grid-cols-7 h-auto">
                    <TabsTrigger value="overview" className="text-xs py-2">
                      <Info className="h-3 w-3 mr-1" />
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="segments" className="text-xs py-2">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Segments ({result.stats?.total_segments ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="topics" className="text-xs py-2">
                      <Layers className="h-3 w-3 mr-1" />
                      Topics ({result.stats?.total_topics ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="frames" className="text-xs py-2">
                      <Film className="h-3 w-3 mr-1" />
                      Frames ({result.stats?.total_frames ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="faces" className="text-xs py-2">
                      <User className="h-3 w-3 mr-1" />
                      Faces ({result.stats?.total_faces ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="models" className="text-xs py-2">
                      <Cpu className="h-3 w-3 mr-1" />
                      Models
                    </TabsTrigger>
                    <TabsTrigger value="costs" className="text-xs py-2">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Costs
                    </TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="mt-4 space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileVideo className="h-4 w-4 text-blue-600" />
                          Video Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Filename</p>
                            <p className="font-medium truncate">{result.video?.source?.filename ?? 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Duration</p>
                            <p className="font-medium">{formatDuration(result.video?.technical?.duration_sec ?? 0)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Resolution</p>
                            <p className="font-medium">{result.video?.technical?.width ?? 0}×{result.video?.technical?.height ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Frame Rate</p>
                            <p className="font-medium">{(result.video?.technical?.frame_rate_fps ?? 0).toFixed(2)} fps</p>
                          </div>
                          <div>
                            <p className="text-gray-500">File Size</p>
                            <p className="font-medium">{formatFileSize(result.video?.source?.filesize_bytes ?? 0)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">MIME Type</p>
                            <p className="font-medium">{result.video?.source?.mime_type ?? 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Audio</p>
                            <p className="font-medium">{result.video?.technical?.audio_sample_rate_hz ?? 0} Hz, {result.video?.technical?.audio_channels ?? 0}ch</p>
                          </div>
                          <div>
                            <p className="text-gray-500">MD5 Hash</p>
                            <p className="font-mono text-xs truncate">{result.video?.hashes?.md5 ?? 'N/A'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-100">
                            <MessageSquare className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{result.stats?.total_segments ?? 0}</p>
                            <p className="text-xs text-gray-500">Segments</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-100">
                            <Layers className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{result.stats?.total_topics ?? 0}</p>
                            <p className="text-xs text-gray-500">Topics</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-100">
                            <Film className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{result.stats?.total_frames ?? 0}</p>
                            <p className="text-xs text-gray-500">Frames</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-orange-100">
                            <User className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{result.stats?.total_faces ?? 0}</p>
                            <p className="text-xs text-gray-500">Faces</p>
                          </div>
                        </div>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Hash className="h-4 w-4 text-gray-600" />
                          Identifiers
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm">
                        <div className="grid grid-cols-1 gap-2">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Video ID</span>
                            <code className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{result.video?.rcsq_video_id ?? 'N/A'}</code>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Created At</span>
                            <span>{result.created_at ? new Date(result.created_at).toLocaleString() : 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Tool Version</span>
                            <span>{result.tool ?? 'rcsq-tool'} v{result.version ?? '1.0.0'}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Segments Tab */}
                  <TabsContent value="segments" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Transcript Segments</CardTitle>
                        <CardDescription>
                          {result.segments?.length ?? 0} segments with embeddings ({result.models?.text_embedding?.dimension ?? 1024}d)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
                          {(result.segments ?? []).map((segment, i) => (
                            <div key={i} className="border rounded-lg p-3 bg-gray-50">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline" className="font-mono text-xs">
                                  seg_{String(segment?.segment_id ?? i + 1).padStart(4, '0')}
                                </Badge>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <Clock className="h-3 w-3" />
                                  {formatTimestamp(segment?.time?.start_sec ?? 0)} - {formatTimestamp(segment?.time?.end_sec ?? 0)}
                                  <span className="text-gray-400">|</span>
                                  <span>Conf: {((segment?.transcript?.avg_confidence ?? 0) * 100).toFixed(1)}%</span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-700">{segment?.transcript?.text ?? ''}</p>
                              <div className="mt-2 text-xs text-gray-400">
                                Embedding: [{segment?.text_embedding?.vector?.slice(0, 3).map(v => v?.toFixed?.(4) ?? '0').join(', ') ?? ''}... ] ({segment?.text_embedding?.model ?? 'unknown'})
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Topics Tab */}
                  <TabsContent value="topics" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Extracted Topics</CardTitle>
                        <CardDescription>
                          Topics extracted using {result.models?.topic_extraction?.name ?? 'GPT'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4 max-h-[600px] overflow-y-auto">
                          {(result.topics ?? []).map((topic, i) => (
                            <div key={i} className="border rounded-lg p-4">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <Badge className="mb-2">{topic?.label ?? 'Topic'}</Badge>
                                  <p className="text-sm text-gray-600">{topic?.description ?? ''}</p>
                                </div>
                                <code className="text-xs text-gray-400 font-mono">{topic?.topic_id ?? ''}</code>
                              </div>
                              <div className="mt-3 p-3 bg-gray-50 rounded">
                                <p className="text-sm text-gray-700">{topic?.summary?.text ?? ''}</p>
                                <p className="text-xs text-gray-400 mt-2">Summarized by: {topic?.summary?.model ?? 'unknown'}</p>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1">
                                {(topic?.segment_ids ?? []).map((segId, j) => (
                                  <Badge key={j} variant="outline" className="text-xs font-mono">{segId}</Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Frames Tab */}
                  <TabsContent value="frames" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Extracted Frames</CardTitle>
                        <CardDescription>
                          Captioned with {result.models?.captioning?.name ?? 'GPT'}, embedded with {result.models?.image_embedding?.name ?? 'Voyage'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[700px] overflow-y-auto">
                          {(result.frames ?? []).map((frame, i) => (
                            <div key={i} className="border rounded-lg overflow-hidden">
                              <div className="aspect-video bg-gray-100 relative">
                                {frame?.image?.data_base64 ? (
                                  <img
                                    src={`data:${frame.image.encoding ?? 'image/jpeg'};base64,${frame.image.data_base64}`}
                                    alt={`Frame at ${formatTimestamp(frame?.time?.timestamp_sec ?? 0)}`}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
                                )}
                                <Badge className="absolute top-2 left-2 font-mono text-xs">
                                  {formatTimestamp(frame?.time?.timestamp_sec ?? 0)}
                                </Badge>
                              </div>
                              <div className="p-3">
                                <code className="text-xs text-gray-400 font-mono">{frame?.frame_id ?? ''}</code>
                                <p className="text-sm text-gray-700 mt-1">{frame?.caption?.text ?? ''}</p>
                                <p className="text-xs text-gray-400 mt-2">
                                  Embedding: {frame?.image_embedding?.model ?? 'unknown'} ({frame?.image_embedding?.vector?.length ?? 0}d)
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Faces Tab */}
                  <TabsContent value="faces" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Detected Faces</CardTitle>
                        <CardDescription>
                          Detected with {result.models?.face_detection?.name ?? 'Rekognition'}, embedded with {result.models?.image_embedding?.name ?? 'Voyage'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!result.faces || result.faces.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <User className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                            <p>No faces detected in this video</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto">
                            {result.faces.map((face, i) => (
                              <div key={i} className="border rounded-lg overflow-hidden">
                                <div className="aspect-square bg-gray-100">
                                  {face?.image?.data_base64 ? (
                                    <img
                                      src={`data:${face.image.encoding ?? 'image/jpeg'};base64,${face.image.data_base64}`}
                                      alt={`Face ${i + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
                                  )}
                                </div>
                                <div className="p-2 text-xs">
                                  <code className="text-gray-400 font-mono block">{face?.face_id ?? ''}</code>
                                  <div className="flex items-center gap-1 mt-1 text-gray-500">
                                    <Clock className="h-3 w-3" />
                                    {formatTimestamp(face?.time?.timestamp_sec ?? 0)}
                                  </div>
                                  <div className="flex items-center gap-1 text-gray-500">
                                    <Film className="h-3 w-3" />
                                    {face?.frame_id ?? ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Models Tab */}
                  <TabsContent value="models" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Models Used</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Mic className="h-4 w-4 text-purple-600" />
                                <span className="font-medium">Transcription</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.transcription?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.transcription?.provider ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Language: {result.models?.transcription?.language ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="h-4 w-4 text-blue-600" />
                                <span className="font-medium">Segment Summarisation</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.segment_summarisation?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.segment_summarisation?.provider ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Layers className="h-4 w-4 text-green-600" />
                                <span className="font-medium">Topic Extraction</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.topic_extraction?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.topic_extraction?.provider ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Hash className="h-4 w-4 text-indigo-600" />
                                <span className="font-medium">Text Embedding</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.text_embedding?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.text_embedding?.provider ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Dimension: {result.models?.text_embedding?.dimension ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <ImageIcon className="h-4 w-4 text-orange-600" />
                                <span className="font-medium">Image Embedding</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.image_embedding?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.image_embedding?.provider ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Dimension: {result.models?.image_embedding?.dimension ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Eye className="h-4 w-4 text-cyan-600" />
                                <span className="font-medium">Captioning</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.captioning?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.captioning?.provider ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-lg p-4 md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <User className="h-4 w-4 text-pink-600" />
                                <span className="font-medium">Face Detection</span>
                              </div>
                              <p className="text-sm text-gray-600">{result.models?.face_detection?.name ?? 'N/A'}</p>
                              <p className="text-xs text-gray-400">Provider: {result.models?.face_detection?.provider ?? 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Costs Tab */}
                  <TabsContent value="costs" className="mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Cost Breakdown</CardTitle>
                        <CardDescription>Estimated API costs for this processing job</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {result.stats.usage && result.stats.usage.models && result.stats.usage.models.length > 0 ? (
                          <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                              <div className="flex items-center justify-between">
                                <span className="text-lg font-medium text-green-800">Total Estimated Cost</span>
                                <span className="text-2xl font-bold text-green-700">
                                  {formatCost(result.stats.usage.total_estimated_cost_usd ?? 0)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-2 text-sm text-green-600">
                                <span>Total Tokens</span>
                                <span className="font-mono">{(result.stats.usage.total_tokens ?? 0).toLocaleString()}</span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-700">By Model</h4>
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="text-left p-3 font-medium text-gray-600">Model</th>
                                      <th className="text-right p-3 font-medium text-gray-600">Input Tokens</th>
                                      <th className="text-right p-3 font-medium text-gray-600">Output Tokens</th>
                                      <th className="text-right p-3 font-medium text-gray-600">Total Tokens</th>
                                      <th className="text-right p-3 font-medium text-gray-600">Estimated Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {result.stats.usage.models.map((usage, index) => (
                                      <tr key={usage.model || index} className="border-t">
                                        <td className="p-3 font-mono text-xs">{usage.model ?? 'Unknown'}</td>
                                        <td className="p-3 text-right text-gray-600">{(usage.input_tokens ?? 0).toLocaleString()}</td>
                                        <td className="p-3 text-right text-gray-600">{(usage.output_tokens ?? 0).toLocaleString()}</td>
                                        <td className="p-3 text-right text-gray-600">{(usage.total_tokens ?? 0).toLocaleString()}</td>
                                        <td className="p-3 text-right font-medium">{formatCost(usage.estimated_cost_usd ?? 0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <DollarSign className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                            <p>Cost information not available</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <Card className="h-full min-h-[400px] flex items-center justify-center">
                <div className="text-center text-gray-400 p-8">
                  <FileVideo className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium text-gray-500">No Results Yet</p>
                  <p className="text-sm mt-1">Upload a video to start processing</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-8">
        <div className="container mx-auto max-w-7xl px-4 py-4 text-center text-sm text-gray-500">
          RCSQ Tool v1.0.0 • Video Preprocessing for Research Applications
        </div>
      </footer>
    </div>
  );
}
