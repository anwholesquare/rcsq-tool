'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
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
  ChevronRight,
  Home,
  Settings,
  Menu,
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

const DEFAULT_MAX_FILE_SIZE_MB = 10;
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
  const [maxFrameLimit, setMaxFrameLimit] = useState<number>(1000);
  const [maxVideoSize, setMaxVideoSize] = useState<number>(10);

  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RcsqResult | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [resultTab, setResultTab] = useState<ResultTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
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

    const maxBytes = maxVideoSize * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setError(`File too large. Maximum size is ${maxVideoSize} MB`);
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setProcessingState('idle');
    setProgressLog([]);
  }, [maxVideoSize]);

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
    formData.append('max_frame_limit', String(maxFrameLimit));
    formData.append('max_video_size', String(maxVideoSize));

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
    if (jsonInputRef.current) {
      jsonInputRef.current.value = '';
    }
  }, []);

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (!selectedFile) {
      return;
    }

    // Check file type
    if (!selectedFile.name.endsWith('.json') && selectedFile.type !== 'application/json') {
      setError('Please select a valid JSON file');
      if (jsonInputRef.current) {
        jsonInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Basic validation - check for required fields
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON structure');
        }

        // Check for some expected fields
        if (!parsed.video && !parsed.segments && !parsed.frames) {
          throw new Error('JSON does not appear to be a valid RCSQ result. Missing expected fields.');
        }

        // Set the result
        setResult(parsed as RcsqResult);
        setProcessingState('complete');
        setProgressLog([]);
        setCurrentProgress(null);
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid JSON';
        setError(`JSON is invalid: ${message}`);
        setResult(null);
      }

      // Reset the input
      if (jsonInputRef.current) {
        jsonInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
      if (jsonInputRef.current) {
        jsonInputRef.current.value = '';
      }
    };

    reader.readAsText(selectedFile);
  }, []);

  const handleDemoImport = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/demo.json');
      if (!response.ok) {
        throw new Error('Failed to load demo file');
      }
      
      const parsed = await response.json();

      // Basic validation - check for required fields
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON structure');
      }

      // Check for some expected fields
      if (!parsed.video && !parsed.segments && !parsed.frames) {
        throw new Error('JSON does not appear to be a valid RCSQ result. Missing expected fields.');
      }

      // Set the result
      setResult(parsed as RcsqResult);
      setProcessingState('complete');
      setProgressLog([]);
      setCurrentProgress(null);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load demo';
      setError(`Demo import failed: ${message}`);
      setResult(null);
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
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 border-r bg-background">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image 
              src="/logo.png" 
              alt="RCSQ Logo" 
              width={32} 
              height={32}
            />
            <span className="font-semibold">RCSQ</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <Link
            href="/"
            className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-secondary/50 transition-colors"
          >
            <Home className="w-4 h-4" />
            Documentation
          </Link>
          <div className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">
            <Cpu className="w-4 h-4" />
            Process Video
          </div>
        </nav>
        <div className="p-4 border-t">
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Quick Start</p>
            <p>1. Upload video (max 10MB)</p>
            <p>2. Enter API credentials</p>
            <p>3. Click Process Video</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center px-4 sm:px-6">
            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-14 items-center border-b px-4">
                  <Link href="/" className="flex items-center gap-2">
                    <Image 
                      src="/logo.png" 
                      alt="RCSQ Logo" 
                      width={32} 
                      height={32}
                    />
                    <span className="font-semibold">RCSQ</span>
                  </Link>
                </div>
                <nav className="flex-1 space-y-1 p-4">
                  <Link
                    href="/"
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-secondary/50 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Home className="w-4 h-4" />
                    Documentation
                  </Link>
                  <div className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md bg-secondary text-secondary-foreground">
                    <Cpu className="w-4 h-4" />
                    Process Video
                  </div>
                </nav>
                <div className="p-4 border-t">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium">Quick Start</p>
                    <p>1. Upload video (max 10MB)</p>
                    <p>2. Enter API credentials</p>
                    <p>3. Click Process Video</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Video Processing</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Upload Form */}
            <div className="lg:col-span-1 space-y-6">
              {/* Upload Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Upload Video</CardTitle>
                  <CardDescription>
                    Max {maxVideoSize} MB • MP4, WebM, MOV, MKV
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* File Input */}
                    <div
                      className={`
                        relative border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors
                        ${file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
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
                        <div className="space-y-2">
                          <FileVideo className="h-10 w-10 mx-auto text-primary" />
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                          <p className="text-sm font-medium">Click to upload</p>
                          <p className="text-xs text-muted-foreground">Drag & drop or browse</p>
                        </div>
                      )}
                    </div>

                    {/* Auth Mode */}
                    <Tabs value={authMode} onValueChange={(v) => setAuthMode(v as AuthMode)}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="token" disabled={isProcessing} className="text-xs">
                          <Key className="h-3 w-3 mr-1" />
                          Token
                        </TabsTrigger>
                        <TabsTrigger value="keys" disabled={isProcessing} className="text-xs">
                          <Key className="h-3 w-3 mr-1" />
                          API Keys
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="token" className="mt-3 space-y-3">
                        <div>
                          <Label htmlFor="secretToken" className="text-xs">Secret Token</Label>
                          <Input
                            id="secretToken"
                            type="password"
                            placeholder="Enter token"
                            value={secretToken}
                            onChange={(e) => setSecretToken(e.target.value)}
                            disabled={isProcessing}
                            className="mt-1.5"
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="keys" className="mt-3 space-y-3">
                        <div>
                          <Label htmlFor="openaiKey" className="text-xs">OpenAI API Key *</Label>
                          <Input
                            id="openaiKey"
                            type="password"
                            placeholder="sk-..."
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            disabled={isProcessing}
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="voyageKey" className="text-xs">Voyage API Key *</Label>
                          <Input
                            id="voyageKey"
                            type="password"
                            placeholder="pa-..."
                            value={voyageKey}
                            onChange={(e) => setVoyageKey(e.target.value)}
                            disabled={isProcessing}
                            className="mt-1.5"
                          />
                        </div>

                        <div className="pt-3 border-t">
                          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium mb-3">
                            <input
                              type="checkbox"
                              checked={enableFaceDetection}
                              onChange={(e) => setEnableFaceDetection(e.target.checked)}
                              disabled={isProcessing}
                              className="rounded"
                            />
                            Face Detection (AWS)
                          </label>

                          {enableFaceDetection && (
                            <div className="space-y-3 pl-6">
                              <div>
                                <Label className="text-xs">AWS Region</Label>
                                <Input
                                  type="text"
                                  value={awsRegion}
                                  onChange={(e) => setAwsRegion(e.target.value)}
                                  disabled={isProcessing}
                                  className="mt-1.5"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Access Key ID *</Label>
                                <Input
                                  type="password"
                                  placeholder="AKIA..."
                                  value={awsAccessKeyId}
                                  onChange={(e) => setAwsAccessKeyId(e.target.value)}
                                  disabled={isProcessing}
                                  className="mt-1.5"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Secret Access Key *</Label>
                                <Input
                                  type="password"
                                  value={awsSecretAccessKey}
                                  onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                                  disabled={isProcessing}
                                  className="mt-1.5"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t">
                          <p className="text-sm font-medium mb-3">Advanced Options</p>
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="maxFrameLimit" className="text-xs">Max Frame Limit</Label>
                              <Input
                                id="maxFrameLimit"
                                type="number"
                                min="1"
                                max="10000"
                                value={maxFrameLimit}
                                onChange={(e) => setMaxFrameLimit(parseInt(e.target.value) || 1000)}
                                disabled={isProcessing}
                                className="mt-1.5"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Default: 1000 frames</p>
                            </div>
                            <div>
                              <Label htmlFor="maxVideoSize" className="text-xs">Max Video Size (MB)</Label>
                              <Input
                                id="maxVideoSize"
                                type="number"
                                min="1"
                                max="1024"
                                value={maxVideoSize}
                                onChange={(e) => setMaxVideoSize(parseFloat(e.target.value) || 10)}
                                disabled={isProcessing}
                                className="mt-1.5"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Default: 10 MB</p>
                            </div>
                          </div>
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

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>

                    {/* Import JSON */}
                    <input
                      ref={jsonInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportJson}
                      disabled={isProcessing}
                      className="hidden"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isProcessing}
                        onClick={() => jsonInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Import JSON
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isProcessing}
                        onClick={handleDemoImport}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Demo Import
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Progress Log */}
              {(isProcessing || progressLog.length > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        Processing Log
                      </span>
                      <Badge variant="outline" className="font-mono text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatTime(elapsedTime)}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentProgress && (
                      <div className="mb-3">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">{currentProgress.stage}</span>
                          <span className="text-muted-foreground">{currentProgress.percent}%</span>
                        </div>
                        <Progress value={currentProgress.percent} className="h-2" />
                      </div>
                    )}

                    <div
                      ref={progressContainerRef}
                      className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs bg-muted rounded-md p-3"
                    >
                      {progressLog.map((log, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span>{log.stage}</span>
                          <span className="text-primary">{log.percent}%</span>
                          {log.details && <span className="text-muted-foreground">{log.details}</span>}
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
                  {/* Success Banner */}
                  <Card className="bg-emerald-50 border-emerald-200">
                    <CardContent className="pt-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-emerald-500 p-2">
                            <CheckCircle2 className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-emerald-900">Processing Complete</p>
                            <p className="text-sm text-emerald-700">
                              Completed in {(result.stats?.processing_time_sec ?? 0).toFixed(1)}s
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleReset}>
                            <X className="h-4 w-4 mr-1" />
                            Clear
                          </Button>
                          <Button size="sm" onClick={handleDownload}>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stats Overview */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Segments</CardTitle>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{result.stats?.total_segments ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Transcript parts</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Topics</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{result.stats?.total_topics ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Extracted themes</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Frames</CardTitle>
                        <Film className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{result.stats?.total_frames ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Keyframes captured</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Faces</CardTitle>
                        <User className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{result.stats?.total_faces ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Faces detected</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Result Tabs */}
                  <Tabs value={resultTab} onValueChange={(v) => setResultTab(v as ResultTab)}>
                    <TabsList className="grid grid-cols-7 h-auto w-full">
                      <TabsTrigger value="overview" className="text-xs py-2">
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="segments" className="text-xs py-2">
                        Segments
                      </TabsTrigger>
                      <TabsTrigger value="topics" className="text-xs py-2">
                        Topics
                      </TabsTrigger>
                      <TabsTrigger value="frames" className="text-xs py-2">
                        Frames
                      </TabsTrigger>
                      <TabsTrigger value="faces" className="text-xs py-2">
                        Faces
                      </TabsTrigger>
                      <TabsTrigger value="models" className="text-xs py-2">
                        Models
                      </TabsTrigger>
                      <TabsTrigger value="costs" className="text-xs py-2">
                        Costs
                      </TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="mt-4 space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Video Information</CardTitle>
                          <CardDescription>Technical metadata and identifiers</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Filename</p>
                              <p className="font-medium truncate">{result.video?.source?.filename ?? 'Unknown'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Duration</p>
                              <p className="font-medium">{formatDuration(result.video?.technical?.duration_sec ?? 0)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Resolution</p>
                              <p className="font-medium">{result.video?.technical?.width ?? 0}×{result.video?.technical?.height ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Frame Rate</p>
                              <p className="font-medium">{(result.video?.technical?.frame_rate_fps ?? 0).toFixed(2)} fps</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">File Size</p>
                              <p className="font-medium">{formatFileSize(result.video?.source?.filesize_bytes ?? 0)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Audio</p>
                              <p className="font-medium">{result.video?.technical?.audio_sample_rate_hz ?? 0} Hz</p>
                            </div>
                          </div>
                          <div className="mt-4 pt-4 border-t space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Video ID</span>
                              <code className="font-mono text-xs">{result.video?.rcsq_video_id ?? 'N/A'}</code>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">MD5 Hash</span>
                              <code className="font-mono text-xs truncate max-w-xs">{result.video?.hashes?.md5 ?? 'N/A'}</code>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Processing Time</span>
                              <span className="font-medium">{(result.stats?.processing_time_sec ?? 0).toFixed(2)}s</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    {/* Segments Tab */}
                    <TabsContent value="segments" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Transcript Segments</CardTitle>
                          <CardDescription>
                            {result.segments?.length ?? 0} segments with {result.models?.text_embedding?.dimension ?? 1024}-dimensional embeddings
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3 max-h-[600px] overflow-y-auto">
                            {(result.segments ?? []).map((segment, i) => (
                              <div key={i} className="border rounded-md p-3 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline" className="font-mono text-xs">
                                    seg_{String(segment?.segment_id ?? i + 1).padStart(4, '0')}
                                  </Badge>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatTimestamp(segment?.time?.start_sec ?? 0)} - {formatTimestamp(segment?.time?.end_sec ?? 0)}
                                    <span>•</span>
                                    <span>Conf: {((segment?.transcript?.avg_confidence ?? 0) * 100).toFixed(1)}%</span>
                                  </div>
                                </div>
                                <p className="text-sm">{segment?.transcript?.text ?? ''}</p>
                                <div className="mt-2 text-xs text-muted-foreground font-mono">
                                  [{segment?.text_embedding?.vector?.slice(0, 3).map(v => v?.toFixed?.(4) ?? '0').join(', ') ?? ''}...]
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
                        <CardHeader>
                          <CardTitle className="text-base">Extracted Topics</CardTitle>
                          <CardDescription>
                            Extracted using {result.models?.topic_extraction?.name ?? 'GPT'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4 max-h-[600px] overflow-y-auto">
                            {(result.topics ?? []).map((topic, i) => (
                              <div key={i} className="border rounded-md p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <Badge className="mb-2">{topic?.label ?? 'Topic'}</Badge>
                                    <p className="text-sm text-muted-foreground">{topic?.description ?? ''}</p>
                                  </div>
                                  <code className="text-xs text-muted-foreground font-mono">{topic?.topic_id ?? ''}</code>
                                </div>
                                <div className="mt-3 p-3 bg-muted rounded-md">
                                  <p className="text-sm">{topic?.summary?.text ?? ''}</p>
                                  <p className="text-xs text-muted-foreground mt-2">Model: {topic?.summary?.model ?? 'unknown'}</p>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1.5">
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
                        <CardHeader>
                          <CardTitle className="text-base">Extracted Frames</CardTitle>
                          <CardDescription>
                            Captioned with {result.models?.captioning?.name ?? 'GPT'} • Embedded with {result.models?.image_embedding?.name ?? 'Voyage'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[700px] overflow-y-auto">
                            {(result.frames ?? []).map((frame, i) => (
                              <div key={i} className="border rounded-md overflow-hidden hover:shadow-md transition-shadow">
                                <div className="aspect-video bg-muted relative">
                                  {frame?.image?.data_base64 ? (
                                    <img
                                      src={`data:${frame.image.encoding ?? 'image/jpeg'};base64,${frame.image.data_base64}`}
                                      alt={`Frame at ${formatTimestamp(frame?.time?.timestamp_sec ?? 0)}`}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
                                  )}
                                  <Badge className="absolute top-2 left-2 font-mono text-xs">
                                    {formatTimestamp(frame?.time?.timestamp_sec ?? 0)}
                                  </Badge>
                                </div>
                                <div className="p-3">
                                  <code className="text-xs text-muted-foreground font-mono block mb-2">{frame?.frame_id ?? ''}</code>
                                  <p className="text-sm">{frame?.caption?.text ?? ''}</p>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {frame?.image_embedding?.model ?? 'unknown'} • {frame?.image_embedding?.vector?.length ?? 0}d
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
                        <CardHeader>
                          <CardTitle className="text-base">Detected Faces</CardTitle>
                          <CardDescription>
                            Detected with {result.models?.face_detection?.name ?? 'Rekognition'} • Embedded with {result.models?.image_embedding?.name ?? 'Voyage'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {!result.faces || result.faces.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                              <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                              <p>No faces detected in this video</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto">
                              {result.faces.map((face, i) => (
                                <div key={i} className="border rounded-md overflow-hidden hover:shadow-md transition-shadow">
                                  <div className="aspect-square bg-muted">
                                    {face?.image?.data_base64 ? (
                                      <img
                                        src={`data:${face.image.encoding ?? 'image/jpeg'};base64,${face.image.data_base64}`}
                                        alt={`Face ${i + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
                                    )}
                                  </div>
                                  <div className="p-2 text-xs space-y-1">
                                    <code className="text-muted-foreground font-mono block truncate">{face?.face_id ?? ''}</code>
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {formatTimestamp(face?.time?.timestamp_sec ?? 0)}
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
                        <CardHeader>
                          <CardTitle className="text-base">Models Used</CardTitle>
                          <CardDescription>AI models and configurations for this processing job</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="border rounded-md p-3 space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Mic className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Transcription</span>
                              </div>
                              <p className="text-sm">{result.models?.transcription?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.transcription?.provider ?? 'N/A'} • {result.models?.transcription?.language ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-md p-3 space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Summarisation</span>
                              </div>
                              <p className="text-sm">{result.models?.segment_summarisation?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.segment_summarisation?.provider ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-md p-3 space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Layers className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Topic Extraction</span>
                              </div>
                              <p className="text-sm">{result.models?.topic_extraction?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.topic_extraction?.provider ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-md p-3 space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Captioning</span>
                              </div>
                              <p className="text-sm">{result.models?.captioning?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.captioning?.provider ?? 'N/A'}</p>
                            </div>

                            <div className="border rounded-md p-3 space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Hash className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Text Embedding</span>
                              </div>
                              <p className="text-sm">{result.models?.text_embedding?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.text_embedding?.provider ?? 'N/A'} • {result.models?.text_embedding?.dimension ?? 'N/A'}d</p>
                            </div>

                            <div className="border rounded-md p-3 space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Image Embedding</span>
                              </div>
                              <p className="text-sm">{result.models?.image_embedding?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.image_embedding?.provider ?? 'N/A'} • {result.models?.image_embedding?.dimension ?? 'N/A'}d</p>
                            </div>

                            <div className="border rounded-md p-3 space-y-1 md:col-span-2">
                              <div className="flex items-center gap-2 mb-1">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Face Detection</span>
                              </div>
                              <p className="text-sm">{result.models?.face_detection?.name ?? 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{result.models?.face_detection?.provider ?? 'N/A'}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    {/* Costs Tab */}
                    <TabsContent value="costs" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Cost Breakdown</CardTitle>
                          <CardDescription>Estimated API costs and token usage</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {result.stats.usage && result.stats.usage.models && result.stats.usage.models.length > 0 ? (
                            <div className="space-y-4">
                              <div className="border rounded-md p-4 bg-emerald-50 border-emerald-200">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-emerald-900">Total Estimated Cost</span>
                                  <span className="text-2xl font-bold text-emerald-700">
                                    {formatCost(result.stats.usage.total_estimated_cost_usd ?? 0)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-2 text-sm text-emerald-700">
                                  <span>Total Tokens</span>
                                  <span className="font-mono font-semibold">{(result.stats.usage.total_tokens ?? 0).toLocaleString()}</span>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-semibold mb-3">Per Model Usage</h4>
                                <div className="border rounded-md overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead className="bg-muted">
                                      <tr className="text-xs">
                                        <th className="text-left p-2 font-medium">Model</th>
                                        <th className="text-right p-2 font-medium">Input</th>
                                        <th className="text-right p-2 font-medium">Output</th>
                                        <th className="text-right p-2 font-medium">Total</th>
                                        <th className="text-right p-2 font-medium">Cost</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {result.stats.usage.models.map((usage, index) => (
                                        <tr key={usage.model || index} className="border-t hover:bg-muted/50 transition-colors">
                                          <td className="p-2 font-mono text-xs">{usage.model ?? 'Unknown'}</td>
                                          <td className="p-2 text-right text-xs text-muted-foreground">{(usage.input_tokens ?? 0).toLocaleString()}</td>
                                          <td className="p-2 text-right text-xs text-muted-foreground">{(usage.output_tokens ?? 0).toLocaleString()}</td>
                                          <td className="p-2 text-right text-xs font-medium">{(usage.total_tokens ?? 0).toLocaleString()}</td>
                                          <td className="p-2 text-right text-xs font-semibold">{formatCost(usage.estimated_cost_usd ?? 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-12 text-muted-foreground">
                              <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                              <p>Cost information not available</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <Card className="h-full min-h-[500px] flex items-center justify-center">
                  <div className="text-center p-8">
                    <FileVideo className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                    <p className="text-lg font-medium">No Results Yet</p>
                    <p className="text-sm text-muted-foreground mt-2">Upload a video or import JSON to view results</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t mt-12 py-6 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} RCSQ Tool • Video Preprocessing for Research</p>
            <Link href="/" className="hover:text-foreground transition-colors">
              Back to Documentation
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
