'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import {
  Book,
  Cpu,
  Code2,
  Lightbulb,
  User,
  Github,
  Mail,
  Play,
  Server,
  Activity,
  Video,
  ChevronRight,
  ChevronLeft,
  Zap,
  Shield,
  Cloud,
  ExternalLink,
  FileJson,
  CheckCircle2,
  Copy,
  Check,
  Globe,
  Menu,
} from 'lucide-react';

export default function HomePage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [copiedCurl, setCopiedCurl] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCurl(id);
      setTimeout(() => setCopiedCurl(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <Video className="w-4 h-4" /> },
    { id: 'get-started', label: 'Get Started', icon: <Book className="w-4 h-4" /> },
    { id: 'requirements', label: 'Requirements', icon: <Cpu className="w-4 h-4" /> },
    { id: 'api-reference', label: 'API Reference', icon: <Code2 className="w-4 h-4" /> },
    { id: 'use-cases', label: 'Use Cases', icon: <Lightbulb className="w-4 h-4" /> },
    { id: 'author', label: 'Author', icon: <User className="w-4 h-4" /> },
  ];

  const navigateToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getSectionNavigation = (currentId: string) => {
    const currentIndex = navItems.findIndex(item => item.id === currentId);
    return {
      prev: currentIndex > 0 ? navItems[currentIndex - 1] : null,
      next: currentIndex < navItems.length - 1 ? navItems[currentIndex + 1] : null,
    };
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 border-r bg-background">
        <div className="flex h-14 items-center border-b px-4">
          <div className="flex items-center gap-2">
        <Image
              src="/logo.png" 
              alt="RCSQ Logo" 
              width={32} 
              height={32}
            />
            <span className="font-semibold">RCSQ</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateToSection(item.id)}
              className={`flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors ${
                activeSection === item.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-secondary/50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t">
          <Link
            href="/rcsq"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
          >
            <Play className="w-4 h-4" />
            Try Demo
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen">
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
                  <div className="flex items-center gap-2">
                    <Image
                      src="/logo.png" 
                      alt="RCSQ Logo" 
                      width={32} 
                      height={32}
                    />
                    <span className="font-semibold">RCSQ</span>
                  </div>
                </div>
                <nav className="flex-1 space-y-1 p-4">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigateToSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors ${
                        activeSection === item.id
                          ? 'bg-secondary text-secondary-foreground'
                          : 'hover:bg-secondary/50'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </nav>
                <div className="p-4 border-t">
                  <Link
                    href="/rcsq"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Play className="w-4 h-4" />
                    Try Demo
                  </Link>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">RCSQ Tool API</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <a
                href="https://github.com/anwholesquare"
            target="_blank"
            rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-secondary transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6 md:p-8">
          {/* Overview */}
          {activeSection === 'overview' && (
          <section id="overview">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Efficiently Retrieve Contexually Relevant Video Clips</h2>
              <p className="text-muted-foreground mt-1">
                Extract video topics with segments analysing transcription, face, object and frames through RAG pipeline.  
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Processing Speed</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Fast</div>
                  <p className="text-xs text-muted-foreground">In-memory processing</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Max File Size</CardTitle>
                  <Cloud className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1024 MB</div>
                  <p className="text-xs text-muted-foreground">Per video upload</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Costs</CardTitle>
                  <Video className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">$0.35</div>
                  <p className="text-xs text-muted-foreground">Per 100 minutes</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Security</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Private</div>
                  <p className="text-xs text-muted-foreground">No disk persistence</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Features</CardTitle>
                <CardDescription>Comprehensive video analysis capabilities</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-1">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Transcription</p>
                      <p className="text-sm text-muted-foreground">OpenAI Whisper with word-level timestamps</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-1">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Topic Extraction</p>
                      <p className="text-sm text-muted-foreground">GPT-4.1-nano for semantic analysis</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-1">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Frame Captioning</p>
                      <p className="text-sm text-muted-foreground">GPT-5-mini vision for visual descriptions</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-1">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Embeddings</p>
                      <p className="text-sm text-muted-foreground">Voyage AI 1024-dim vectors for search</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-1">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Face Detection</p>
                      <p className="text-sm text-muted-foreground">AWS Rekognition with face embeddings</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-primary/10 p-1">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Cost Tracking</p>
                      <p className="text-sm text-muted-foreground">Per-model token usage and estimates</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
          )}

          {/* Get Started */}
          {activeSection === 'get-started' && (
          <section id="get-started">
            <h2 className="text-2xl font-bold tracking-tight mb-4">Get Started</h2>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Installation</CardTitle>
                  <CardDescription>Clone and install dependencies</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-x-auto">
                    <SyntaxHighlighter
                      language="bash"
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(var(--muted))',
                      }}
                      PreTag="div"
                    >
                      git clone https://github.com/anwholesquare/rcsq-tool.git
                    </SyntaxHighlighter>
                  </div>
                  <div className="overflow-x-auto">
                    <SyntaxHighlighter
                      language="bash"
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(var(--muted))',
                      }}
                      PreTag="div"
                    >
                      cd rcsq-tool && pnpm install
                    </SyntaxHighlighter>
                  </div>
                  <div className="overflow-x-auto">
                    <SyntaxHighlighter
                      language="bash"
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(var(--muted))',
                      }}
                      PreTag="div"
                    >
                      pnpm dev
                    </SyntaxHighlighter>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Environment Setup</CardTitle>
                  <CardDescription>Configure API credentials</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">OPENAI_API_KEY</Badge>
                    <span className="text-muted-foreground text-xs sm:text-sm">OpenAI API access</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">VOYAGE_API_KEY</Badge>
                    <span className="text-muted-foreground text-xs sm:text-sm">Voyage embeddings</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">AWS_ACCESS_KEY_ID</Badge>
                    <span className="text-muted-foreground text-xs sm:text-sm">Rekognition Key ID</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">AWS_REGION</Badge>
                    <span className="text-muted-foreground text-xs sm:text-sm">Rekognition Region</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">AWS_SECRET_ACCESS_KEY</Badge>
                    <span className="text-muted-foreground text-xs sm:text-sm">Rekognition Secret Key</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Section Navigation */}
            <div className="flex items-center justify-between pt-6 border-t mt-8">
              <Button
                variant="outline"
                onClick={() => navigateToSection('overview')}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous: Overview
              </Button>
              <Button
                variant="outline"
                onClick={() => navigateToSection('requirements')}
                className="gap-2"
              >
                Next: Requirements
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </section>
          )}

          {/* Requirements */}
          {activeSection === 'requirements' && (
          <section id="requirements">
            <h2 className="text-2xl font-bold tracking-tight mb-4">Requirements</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Minimum</CardTitle>
                  <CardDescription>Basic specifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>CPU:</strong> 2 cores</div>
                  <div><strong>Memory:</strong> 512 MB</div>
                  <div><strong>Node.js:</strong> 18.x+</div>
                  <div><strong>Storage:</strong> In-memory</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommended</CardTitle>
                  <CardDescription>Optimal performance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>CPU:</strong> 4+ cores</div>
                  <div><strong>Memory:</strong> 8192 MB</div>
                  <div><strong>Timeout:</strong> 10000s</div>
                  <div><strong>Network:</strong> Stable</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Processing Limits</CardTitle>
                  <CardDescription>Per request constraints</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Max file:</strong> 1024 MB</div>
                  <div><strong>Max frames:</strong> 10000</div>
                  <div><strong>Interval:</strong> 5 seconds</div>
                  <div><strong>Formats:</strong> mp4, webm, mov</div>
                </CardContent>
              </Card>
            </div>

            {/* API Keys Guide */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Getting API Keys</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">OpenAI API Key</CardTitle>
                      <a 
                        href="https://platform.openai.com/signup" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <CardDescription>For Whisper transcription and GPT models</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="text-sm space-y-2 list-decimal list-inside">
                      <li>Visit <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a></li>
                      <li>Sign up or log in to your account</li>
                      <li>Navigate to <strong>API Keys</strong> section</li>
                      <li>Click <strong>"Create new secret key"</strong></li>
                      <li>Copy the key (starts with <code className="text-xs bg-muted px-1 py-0.5 rounded">sk-</code>)</li>
                    </ol>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        <strong>Note:</strong> Add billing information to use the API
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">Voyage AI API Key</CardTitle>
                      <a 
                        href="https://www.voyageai.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <CardDescription>For text and image embeddings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="text-sm space-y-2 list-decimal list-inside">
                      <li>Visit <a href="https://www.voyageai.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">voyageai.com</a></li>
                      <li>Sign up for an account</li>
                      <li>Go to the <strong>Dashboard</strong></li>
                      <li>Navigate to <strong>API Keys</strong></li>
                      <li>Generate and copy your API key</li>
                    </ol>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        <strong>Models used:</strong> voyage-3-large, voyage-multimodal-3
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">AWS Credentials (Rekognition)</CardTitle>
                      <a 
                        href="https://aws.amazon.com/console/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <CardDescription>For face detection and recognition</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="text-sm space-y-2 list-decimal list-inside">
                      <li>Visit <a href="https://aws.amazon.com/console/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AWS Console</a> and sign in</li>
                      <li>Navigate to <strong>IAM</strong> (Identity and Access Management)</li>
                      <li>Go to <strong>Users</strong> → <strong>Create User</strong></li>
                      <li>Attach the <code className="text-xs bg-muted px-1 py-0.5 rounded">AmazonRekognitionFullAccess</code> policy</li>
                      <li>Go to <strong>Security credentials</strong> → <strong>Create access key</strong></li>
                      <li>Select <strong>"Application running outside AWS"</strong></li>
                      <li>Copy both <strong>Access Key ID</strong> and <strong>Secret Access Key</strong></li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Section Navigation */}
            <div className="flex items-center justify-between pt-6 border-t mt-8">
              <Button
                variant="outline"
                onClick={() => navigateToSection('get-started')}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous: Get Started
              </Button>
              <Button
                variant="outline"
                onClick={() => navigateToSection('api-reference')}
                className="gap-2"
              >
                Next: API Reference
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </section>
          )}

          {/* API Reference */}
          {activeSection === 'api-reference' && (
          <section id="api-reference">
            <h2 className="text-2xl font-bold tracking-tight mb-4">API Reference</h2>
            
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Base URL</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-sm font-mono">http://localhost:3000</code>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* POST /api/rcsq */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge>POST</Badge>
                    <code className="text-sm font-mono">/api/rcsq</code>
                  </div>
                  <CardDescription className="mt-2">
                    Process a video file and return structured JSON with transcription, topics, frames, and faces
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Request */}
                    <div className="border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-2">Request Body</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Content-Type: <code className="font-mono">multipart/form-data</code>
                      </p>
                      
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        {/* CURL Example */}
                        <div className="rounded-md bg-muted p-3 mb-4 relative group">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold">Example cURL</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => copyToClipboard(
                                `curl -X POST http://localhost:3000/api/rcsq \\
  -F "file=@/path/to/video.mp4" \\
  -F "openaiApiKey=sk-..." \\
  -F "voyageApiKey=pa-..." \\
  -F "awsRegion=us-east-1" \\
  -F "awsAccessKeyId=AKIA..." \\
  -F "awsSecretAccessKey=..." \\
  -F "enableFaceDetection=true" \\
  -F "max_frame_limit=1000" \\
  -F "max_video_size=10"`,
                                'curl-rcsq'
                              )}
                            >
                              {copiedCurl === 'curl-rcsq' ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <SyntaxHighlighter
                            language="bash"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '0.5rem',
                              fontSize: '0.75rem',
                              borderRadius: '0.375rem',
                              background: 'hsl(var(--muted))',
                            }}
                            wrapLongLines={true}
                          >
{`curl -X POST http://localhost:3000/api/rcsq \\
  -F "file=@/path/to/video.mp4" \\
  -F "openaiApiKey=sk-..." \\
  -F "voyageApiKey=pa-..." \\
  -F "awsRegion=us-east-1" \\
  -F "awsAccessKeyId=AKIA..." \\
  -F "awsSecretAccessKey=..." \\
  -F "enableFaceDetection=true" \\
  -F "max_frame_limit=1000" \\
  -F "max_video_size=10"`}
                          </SyntaxHighlighter>
                        </div>
                        
                        <div className="border-t pt-4">
                          <p className="text-xs font-semibold mb-3">Parameters</p>
                        </div>
                        {/* file */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono font-semibold">file</code>
                            <Badge variant="destructive" className="text-xs">required</Badge>
                            <span className="text-xs text-muted-foreground">File</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Video file to process. Supported formats: MP4, WebM, MOV, MKV. Maximum size: 10 MB.
                          </p>
                        </div>

                       

                        {/* secret_token */}
                        {/* <div className="border-l-2 border-muted pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">secret_token</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Secret token to use server-side environment credentials. If provided, API keys below are not required.
                          </p>
                        </div> */}

                        {/* openaiApiKey */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">openaiApiKey</code>
                            <Badge variant="destructive" className="text-xs">required</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            OpenAI API key (starts with <code className="font-mono text-xs">sk-</code>).
                          </p>
                        </div>

                        {/* voyageApiKey */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">voyageApiKey</code>
                            <Badge variant="destructive" className="text-xs">required</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Voyage AI API key for embeddings.
                          </p>
                        </div>

                        {/* awsRegion */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">awsRegion</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            AWS region for Rekognition service. Default: <code className="font-mono text-xs">"us-east-1"</code>
                          </p>
                        </div>

                        {/* awsAccessKeyId */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">awsAccessKeyId</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            AWS access key ID for Rekognition.
                          </p>
                        </div>

                        {/* awsSecretAccessKey */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">awsSecretAccessKey</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            AWS secret access key for Rekognition.
                          </p>
                        </div>

                        {/* enableFaceDetection */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">enableFaceDetection</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">string</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Enable or disable face detection. Values: <code className="font-mono text-xs">"true"</code> or <code className="font-mono text-xs">"false"</code>. Default: <code className="font-mono text-xs">"true"</code>
                          </p>
                        </div>

                        {/* max_frame_limit */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">max_frame_limit</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">number</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Maximum number of frames to extract. Default: <code className="font-mono text-xs">1000</code>
                          </p>
                        </div>

                        {/* max_video_size */}
                        <div className="pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono">max_video_size</code>
                            <Badge variant="outline" className="text-xs">optional</Badge>
                            <span className="text-xs text-muted-foreground">number</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Maximum video file size in MB. Default: <code className="font-mono text-xs">10</code>
                          </p>
                        </div>

                      </div>
                    </div>

                    {/* Response */}
                    <div className="border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <FileJson className="w-4 h-4" />
                        Response (200 OK)
                      </h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Returns a complete JSON object with video analysis
                      </p>
                      
                      <div className="max-h-[600px] overflow-y-auto pr-2">
                        <SyntaxHighlighter
                          language="json"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: '0.75rem',
                            fontSize: '0.75rem',
                            borderRadius: '0.375rem',
                            background: 'hsl(var(--muted))',
                          }}
                          showLineNumbers={false}
                        >
{`{
  "tool": "rcsq-tool",
  "version": "1.0.0",
  "created_at": "2025-12-14T10:30:00Z",
  "video": {
    "source": {
      "filename": "video.mp4",
      "filesize_bytes": 9423872,
      "mime_type": "video/mp4"
    },
    "technical": {
      "duration_sec": 105.5,
      "frame_rate_fps": 30.0,
      "width": 1920,
      "height": 1080,
      "audio_sample_rate_hz": 16000,
      "audio_channels": 1
    },
    "hashes": { "md5": "abc123..." },
    "rcsq_video_id": "vid_1234567890_uuid"
  },
  "models": { 
    /* transcription, summarisation, topics, embeddings, captioning, face_detection */ 
  },
  "segments": [
    {
      "segment_id": "seg_0001",
      "rcsq_video_id": "vid_...",
      "time": { "start_sec": 0.0, "end_sec": 36.5 },
      "transcript": {
        "text": "Transcript text here...",
        "avg_confidence": 0.96
      },
      "summary": { "text": "Summary here", "model": "gpt-4o-mini" },
      "text_embedding": {
        "model": "voyage-3-large",
        "vector": [0.0123, -0.0345, ...]  // 1024-dim
      }
    }
    // ... more segments
  ],
  "topics": [
    {
      "topic_id": "topic_0001",
      "rcsq_video_id": "vid_...",
      "label": "Introduction to Arrays",
      "description": "Explains array concepts...",
      "summary": { "text": "...", "model": "gpt-4o-mini" },
      "segment_ids": ["seg_0001", "seg_0002"]
    }
    // ... more topics
  ],
  "frames": [
    {
      "frame_id": "frame_0001",
      "rcsq_video_id": "vid_...",
      "time": { "timestamp_sec": 12.0 },
      "image": {
        "encoding": "image/jpeg",
        "data_base64": "/9j/4AAQSkZJRgABAQAA..."
      },
      "caption": { "text": "Code editor showing...", "model": "gpt-5-mini" },
      "image_embedding": {
        "model": "voyage-multimodal-3",
        "vector": [0.01, -0.22, ...]  // 1024-dim
      }
    }
    // ... more frames (5s interval)
  ],
  "faces": [
    {
      "face_id": "face_0001",
      "rcsq_video_id": "vid_...",
      "frame_id": "frame_0001",
      "time": { "timestamp_sec": 12.0 },
      "bounding_box": {
        "left": 100, "top": 150,
        "width": 200, "height": 250
      },
      "confidence": 0.9876,
      "image": { "encoding": "image/jpeg", "data_base64": "..." },
      "face_embedding": {
        "model": "voyage-multimodal-3",
        "vector": [0.11, 0.03, ...]  // 1024-dim
      }
    }
    // ... more faces (AWS Rekognition)
  ],
  "stats": {
    "total_segments": 12,
    "total_topics": 4,
    "total_frames": 20,
    "total_faces": 5,
    "processing_time_sec": 45.2,
    "usage": {
      "models": [
        { "name": "whisper-1", "input_tokens": 5000, "output_tokens": 0, "estimated_cost_usd": 0.15 },
        { "name": "gpt-4o-mini", "input_tokens": 1200, "output_tokens": 800, "estimated_cost_usd": 0.02 }
        // ... more models
      ],
      "total_tokens": 12500,
      "total_estimated_cost_usd": 0.87
    }
  }
}`}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  </div>

                  {/* Error Responses */}
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="text-sm font-semibold mb-3">Error Responses</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="flex items-start gap-2 p-3 border rounded-md">
                        <Badge variant="destructive" className="shrink-0">400</Badge>
                        <span className="text-muted-foreground">Invalid file type, size exceeded, or missing credentials</span>
                      </div>
                      <div className="flex items-start gap-2 p-3 border rounded-md">
                        <Badge variant="destructive" className="shrink-0">500</Badge>
                        <span className="text-muted-foreground">Processing error (API failures, FFmpeg errors, etc.)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* POST /api/rcsq-stream */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge>POST</Badge>
                    <code className="text-sm font-mono">/api/rcsq-stream</code>
                  </div>
                  <CardDescription className="mt-2">
                    Same as /api/rcsq but streams progress via Server-Sent Events (SSE) for real-time updates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Request */}
                    <div className="border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-2">Request</h4>
                      <div className="max-h-[600px] overflow-y-auto pr-2">
                        <p className="text-sm text-muted-foreground mb-3">Identical to <code className="font-mono text-xs">/api/rcsq</code></p>
                        
                        {/* CURL Example */}
                        <div className="rounded-md bg-muted p-3 mb-3 relative group">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold">Example cURL (with SSE)</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => copyToClipboard(
                                `curl -X POST http://localhost:3000/api/rcsq-stream \\
  -F "file=@/path/to/video.mp4" \\
  -F "openaiApiKey=sk-..." \\
  -F "voyageApiKey=pa-..." \\
  -F "awsRegion=us-east-1" \\
  -F "awsAccessKeyId=AKIA..." \\
  -F "awsSecretAccessKey=..." \\
  -F "enableFaceDetection=true" \\
  -F "max_frame_limit=1000" \\
  -F "max_video_size=10" \\
  --no-buffer`,
                                'curl-stream'
                              )}
                            >
                              {copiedCurl === 'curl-stream' ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <SyntaxHighlighter
                            language="bash"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '0.5rem',
                              fontSize: '0.75rem',
                              borderRadius: '0.375rem',
                              background: 'hsl(var(--muted))',
                            }}
                            wrapLongLines={true}
                          >
{`curl -X POST http://localhost:3000/api/rcsq-stream \\
  -F "file=@/path/to/video.mp4" \\
  -F "openaiApiKey=sk-..." \\
  -F "voyageApiKey=pa-..." \\
  -F "awsRegion=us-east-1" \\
  -F "awsAccessKeyId=AKIA..." \\
  -F "awsSecretAccessKey=..." \\
  -F "enableFaceDetection=true" \\
  -F "max_frame_limit=1000" \\
  -F "max_video_size=10" \\
  --no-buffer`}
                          </SyntaxHighlighter>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          Use <code className="font-mono">--no-buffer</code> flag to see real-time progress events.
                        </p>
                      </div>
                    </div>

                    {/* Response */}
                    <div className="border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3">Response (SSE Stream)</h4>
                      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                        <div className="rounded-md border p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono text-xs">progress</Badge>
                            <span className="text-xs text-muted-foreground">Real-time processing updates</span>
                          </div>
                          <div className="rounded-md bg-muted p-2">
                            <code className="text-xs font-mono block">event: progress</code>
                            <code className="text-xs font-mono block">{`data: {"stage": "Extracting audio", "percent": 25, "timestamp": 1234567890}`}</code>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono text-xs">complete</Badge>
                            <span className="text-xs text-muted-foreground">Final result with full JSON</span>
                          </div>
                          <div className="rounded-md bg-muted p-2">
                            <code className="text-xs font-mono block">event: complete</code>
                            <code className="text-xs font-mono block">{`data: {"result": { ... full RcsqResult object ... }}`}</code>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="destructive" className="font-mono text-xs">error</Badge>
                            <span className="text-xs text-muted-foreground">Processing error</span>
                          </div>
                          <div className="rounded-md bg-muted p-2">
                            <code className="text-xs font-mono block">event: error</code>
                            <code className="text-xs font-mono block">{`data: {"message": "API rate limit exceeded"}`}</code>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* POST /api/health */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">POST</Badge>
                    <code className="text-sm font-mono">/api/health</code>
                  </div>
                  <CardDescription className="mt-2">
                    Check connectivity and configuration of all external services
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Request */}
                    <div className="border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3">Request Body (optional)</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Content-Type: <code className="font-mono">application/json</code>
                      </p>
                      <div className="max-h-[600px] overflow-y-auto pr-2">
                        <p className="text-sm text-muted-foreground mb-3">
                          Provide credentials to test, or use <code className="font-mono text-xs">secret_token</code> to load from server
                        </p>
                        
                        {/* CURL Example */}
                        <div className="rounded-md bg-muted p-3 mb-3 relative group">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold">Example cURL</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => copyToClipboard(
                                `curl -X POST http://localhost:3000/api/health \\
  -H "Content-Type: application/json" \\
  -d '{
    "openaiApiKey": "sk-...",
    "voyageApiKey": "pa-...",
    "awsRegion": "us-east-1",
    "awsAccessKeyId": "AKIA...",
    "awsSecretAccessKey": "..."
  }'`,
                                'curl-health'
                              )}
                            >
                              {copiedCurl === 'curl-health' ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <SyntaxHighlighter
                            language="bash"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '0.5rem',
                              fontSize: '0.75rem',
                              borderRadius: '0.375rem',
                              background: 'hsl(var(--muted))',
                            }}
                            wrapLongLines={true}
                          >
{`curl -X POST http://localhost:3000/api/health \\
  -H "Content-Type: application/json" \\
  -d '{
    "openaiApiKey": "sk-...",
    "voyageApiKey": "pa-...",
    "awsRegion": "us-east-1",
    "awsAccessKeyId": "AKIA...",
    "awsSecretAccessKey": "..."
  }'`}
                          </SyntaxHighlighter>
                        </div>
                        
                        <div className="border-t pt-3">
                          <p className="text-xs font-semibold mb-2">JSON Body</p>
                          <SyntaxHighlighter
                            language="json"
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '0.5rem',
                              fontSize: '0.75rem',
                              borderRadius: '0.375rem',
                              background: 'hsl(var(--muted))',
                            }}
                            showLineNumbers={false}
                          >
{`{
  "secret_token": "your-token",  // or provide direct credentials
  "openaiApiKey": "sk-...",
  "voyageApiKey": "pa-...",
  "awsAccessKeyId": "AKIA...",
  "awsSecretAccessKey": "..."
}`}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    </div>

                    {/* Response */}
                    <div className="border rounded-lg p-4">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <FileJson className="w-4 h-4" />
                        Response (200 OK)
                      </h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Returns connectivity status for all services
                      </p>
                      <div className="max-h-[600px] overflow-y-auto pr-2">
                        <SyntaxHighlighter
                          language="json"
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            padding: '0.75rem',
                            fontSize: '0.75rem',
                            borderRadius: '0.375rem',
                            background: 'hsl(var(--muted))',
                          }}
                          showLineNumbers={false}
                        >
{`{
  "status": "ok",
  "services": {
    "openai": { "status": "connected" },
    "voyage": { "status": "connected" },
    "aws_rekognition": { "status": "connected" },
    "ffmpeg": { "status": "available", "version": "..." },
    "ffprobe": { "status": "available", "version": "..." }
  }
}`}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Section Navigation */}
            <div className="flex items-center justify-between pt-6 border-t mt-8">
              <Button
                variant="outline"
                onClick={() => navigateToSection('requirements')}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous: Requirements
              </Button>
              <Button
                variant="outline"
                onClick={() => navigateToSection('use-cases')}
                className="gap-2"
              >
                Next: Use Cases
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </section>
          )}

          {/* Use Cases */}
          {activeSection === 'use-cases' && (
          <section id="use-cases" className="max-w-4xl mx-auto">
            <div className="space-y-8">
              {/* Header */}
              <div className="space-y-4">
                <h2 className="text-3xl font-bold tracking-tight">Real-World Applications</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  RCSQ Tool transforms how you work with video content by making it searchable, 
                  analyzable, and actionable. Here's how teams across different industries are 
                  leveraging the power of multimodal video analysis.
                </p>
              </div>

              {/* Use Case 1: Video Search */}
              <div className="space-y-4 pt-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Video className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-semibold">Semantic Video Search</h3>
                </div>
                
                <p className="text-base text-muted-foreground leading-relaxed">
                  Transform massive video libraries into searchable knowledge bases. Whether you're managing 
                  educational content, company training materials, or media archives, RCSQ Tool enables 
                  instant discovery of relevant moments across hours of footage.
                </p>

                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium mb-3">Key Benefits:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                        <span>Search by natural language queries across transcript embeddings</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                        <span>Visual similarity search using frame and face embeddings</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                        <span>Extract precise clips with segment timestamps (start/end times)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                        <span>Topic-based navigation for structured content exploration</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">💡 Example Use Case</p>
                  <p className="text-muted-foreground">
                    A company with 1,000+ hours of training videos uses RCSQ to let employees search 
                    "How do I configure the dashboard?" and instantly jump to relevant segments across 
                    multiple videos, saving hours of manual searching.
                  </p>
                </div>
              </div>

              <div className="border-t" />

              {/* Use Case 2: Surveillance Analysis */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Shield className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-semibold">Surveillance & Security Analysis</h3>
                </div>
                
                <p className="text-base text-muted-foreground leading-relaxed">
                  Process hours of security footage automatically with AI-powered face detection and 
                  scene understanding. Create searchable archives that let security teams find specific 
                  individuals or events in seconds instead of hours.
                </p>

                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium mb-3">Key Benefits:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                        <span>AWS Rekognition-powered face detection with confidence scores</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                        <span>Face embeddings for identity matching across multiple cameras</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                        <span>Scene descriptions via GPT-5-mini vision for contextual understanding</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                        <span>Temporal tracking with precise timestamps and bounding boxes</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">💡 Example Use Case</p>
                  <p className="text-muted-foreground">
                    A retail chain processes daily security footage to automatically detect and track 
                    individuals of interest, creating alerts when the same face appears across multiple 
                    store locations, with full audit trails and evidence clips.
                  </p>
                </div>
              </div>

              <div className="border-t" />

              {/* Use Case 3: Content Generation */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Code2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-2xl font-semibold">Automated Content Generation</h3>
                </div>
                
                <p className="text-base text-muted-foreground leading-relaxed">
                  Generate rich metadata, summaries, and descriptions automatically for every video. 
                  Perfect for content management systems, accessibility compliance, and SEO optimization. 
                  Let AI handle the tedious work while you focus on creative decisions.
                </p>

                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium mb-3">Key Benefits:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                        <span>Auto-generated summaries for each segment using GPT-4o-mini</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                        <span>Topic extraction for automatic chapter markers and navigation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                        <span>Frame captions for visual descriptions and accessibility</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                        <span>Whisper transcriptions with word-level timestamps for captions</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">💡 Example Use Case</p>
                  <p className="text-muted-foreground">
                    A YouTube creator uploads a 30-minute tutorial. RCSQ automatically generates: 
                    chapter markers with timestamps, a full description with key topics covered, 
                    SEO-optimized tags, and accessibility-compliant captions—all in under 2 minutes.
                  </p>
                </div>
              </div>

              <div className="border-t" />

              {/* Use Case 4: Virality Detection */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Zap className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-2xl font-semibold">Engagement & Virality Analysis</h3>
                </div>
                
                <p className="text-base text-muted-foreground leading-relaxed">
                  Identify high-engagement moments in your content by analyzing visual and audio 
                  patterns that correlate with viewer retention. Combine frame analysis with 
                  sentiment detection to predict which clips have viral potential.
                </p>

                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium mb-3">Key Benefits:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                        <span>Frame-by-frame visual analysis to detect dynamic moments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                        <span>Topic clustering to identify trending themes and subjects</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                        <span>Face detection to track emotional expressions and reactions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                        <span>Segment embeddings for content similarity and recommendation engines</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">💡 Example Use Case</p>
                  <p className="text-muted-foreground">
                    A social media agency analyzes thousands of TikTok videos to identify patterns 
                    in viral content: peak moments are extracted at 3-7 second marks with high 
                    visual contrast and emotional faces, helping creators optimize their content strategy.
                  </p>
                </div>
              </div>

              <div className="border-t" />

              {/* Additional Applications */}
              <div className="space-y-4 pt-4">
                <h3 className="text-xl font-semibold">Other Applications</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      <p className="font-medium text-sm">Quality Assurance</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Detect production errors, inconsistencies, or quality issues in manufacturing videos
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Book className="w-4 h-4 text-primary" />
                      <p className="font-medium text-sm">E-Learning</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create interactive transcripts, quizzes from topics, and personalized learning paths
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <p className="font-medium text-sm">Broadcasting</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Auto-generate highlights, create clip compilations, and enable real-time search
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-primary" />
                      <p className="font-medium text-sm">Video RAG Systems</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Build retrieval-augmented generation systems with video context for AI chatbots
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section Navigation */}
            <div className="flex items-center justify-between pt-8 border-t mt-12">
              <Button
                variant="outline"
                onClick={() => navigateToSection('api-reference')}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous: API Reference
              </Button>
              <Button
                variant="outline"
                onClick={() => navigateToSection('author')}
                className="gap-2"
              >
                Next: Author
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </section>
          )}

          {/* Author */}
          {activeSection === 'author' && (
          <section id="author">
            <h2 className="text-2xl font-bold tracking-tight mb-4">Author</h2>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-semibold shrink-0">
                    KA
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Khandoker Kafi Anan</h3>
                    <p className="text-sm text-muted-foreground mb-3">Lead AI Engineer</p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href="mailto:khandokeranan@gmail.com"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-secondary transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        khandokeranan@gmail.com
                      </a>
                      <a
                        href="https://github.com/anwholesquare"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-secondary transition-colors"
                      >
                        <Github className="w-3 h-3" />
                        anwholesquare
                        <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <a
                        href="https://khandokeranan.com"
            target="_blank"
            rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-secondary transition-colors"
                      >
                        <Globe className="w-3 h-3" />
                        khandokeranan.com
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-6 pt-6 border-t">
                  RCSQ Tool is part of the{' '}
                  <a href="https://github.com/anwholesquare" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    RCSquare
                  </a>
                  {' '}research project
                </p>
              </CardContent>
            </Card>

            {/* Section Navigation */}
            <div className="flex items-center justify-between pt-6 border-t mt-8">
              <Button
                variant="outline"
                onClick={() => navigateToSection('use-cases')}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous: Use Cases
              </Button>
              <Link href="/rcsq">
                <Button className="gap-2">
                  Try Demo
                  <Play className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </section>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto border-t py-6 px-4 sm:px-6 md:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} Khandoker Kafi Anan. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/rcsq" className="hover:text-foreground transition-colors">
                Try Demo
              </Link>
              <a href="https://github.com/anwholesquare" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                GitHub
              </a>
              <a href="mailto:khandokeranan@gmail.com" className="hover:text-foreground transition-colors">
                Contact
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
