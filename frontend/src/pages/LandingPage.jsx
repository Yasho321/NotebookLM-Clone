import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  MessageSquare,
  Sparkles,
  Upload,
  ArrowRight,
  Sun,
  Moon,
  Check,
  Shield,
  Zap,
  Layers,
  ExternalLink,
  Terminal,
  Database,
  Search,
  ChevronRight,
  CheckCircle2,
  FileCheck,
  Globe,
  Quote,
} from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { Button } from "@/components/ui/button";

// Sample documents for interactive workspace simulator
const SAMPLE_DOCS = [
  {
    id: 'doc-1',
    title: 'Attention Is All You Need',
    authors: 'Vaswani et al. (Google Brain / Research)',
    type: 'PDF',
    size: '2.4 MB',
    chunks: '1,420 Chunks',
    score: '99.4% Match',
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We introduce the Transformer, a model architecture eschewing recurrence entirely and relying on multi-head self-attention to draw global dependencies.',
    hypotheses: [
      'Self-attention enables massive parallelization, eliminating O(n) sequential bottlenecks inherent in recurrent models.',
      'Multi-head attention jointly attends to information across distinct representation subspaces at different positions.',
      'Sinusoidal positional encodings inject sequence order without requiring recurrent step dependencies.'
    ],
    sampleQuestions: [
      {
        q: 'How does Scaled Dot-Product Attention prevent vanishing gradients?',
        a: 'Scaled Dot-Product Attention divides the dot products of Query and Key vectors by √dk before applying softmax. As dk grows large, dot products grow substantially in magnitude, pushing softmax into regions with extremely small gradients. Scaling by 1/√dk counteracts this effect.',
        citation: '§3.2.1, Equation (1)'
      },
      {
        q: 'Why does Multi-Head Attention outperform single-head attention?',
        a: 'Rather than computing a single attention function with d_model-dimensional keys, values, and queries, multi-head attention linearly projects them h times with learned projections. This permits the model to simultaneously attend to information from different representation subspaces at different positions.',
        citation: '§3.2.2, Table 1'
      }
    ]
  },
  {
    id: 'doc-2',
    title: 'Retrieval-Augmented Generation for NLP',
    authors: 'Lewis et al. (Facebook AI Research / NYU)',
    type: 'PDF',
    size: '1.8 MB',
    chunks: '980 Chunks',
    score: '98.9% Match',
    abstract: 'Pre-trained language models store extensive factual knowledge in parametric weights, yet struggle with precision and hallucination. We present RAG, combining parametric seq2seq models with a non-parametric dense vector index of knowledge passages.',
    hypotheses: [
      'Non-parametric retrieval dramatically curtails factual hallucinations by grounding outputs in retrieved passages.',
      'Dense Passage Retrieval (DPR) bi-encoders deliver superior semantic match quality compared to BM25 keyword search.',
      'External knowledge can be expanded or updated in real time by modifying the vector database without retraining model weights.'
    ],
    sampleQuestions: [
      {
        q: 'What is the operational difference between RAG-Sequence and RAG-Token?',
        a: 'In RAG-Sequence, the model retrieves top-K document passages and conditions on the exact same retrieved document to generate the complete target sequence. In RAG-Token, the model marginalizes across different latent document passages for each generated token.',
        citation: '§2.1, Architectural Overview'
      },
      {
        q: 'How are documents chunked and indexed in non-parametric memory?',
        a: 'The source corpus is decomposed into disjoint 100-word text passages. Each passage is embedded into 768-dimensional vectors using a DPR bi-encoder and indexed for sub-millisecond maximum inner-product search.',
        citation: '§2.2, Non-Parametric Memory'
      }
    ]
  },
  {
    id: 'doc-3',
    title: 'DeepSeek-R1: Incentivizing Reasoning via RL',
    authors: 'DeepSeek-AI Research Group',
    type: 'Web Fragment',
    size: '34 KB',
    chunks: '310 Chunks',
    score: '99.1% Match',
    abstract: 'We explore reinforcement learning without supervised fine-tuning as a precursor to multi-stage post-training. DeepSeek-R1-Zero naturally develops autonomous chains of thought, self-reflection, and verification behavior when trained directly with large-scale rule-based rewards.',
    hypotheses: [
      'Advanced reasoning behaviors emerge naturally via pure reinforcement learning using rule-verifiable reward models.',
      'Autonomous error detection and self-correction occur organically without human demonstration traces.',
      'Distillation of reasoning traces into smaller dense models transfers cognitive patterns with unprecedented efficiency.'
    ],
    sampleQuestions: [
      {
        q: 'How does self-verification manifest during inference?',
        a: 'During generation, the model exhibits an organic "Aha moment" where it explicitly pauses, checks intermediate algebraic deductions, backtracks if an inconsistency is detected, and restates its working hypotheses before finalizing.',
        citation: '§3.1, Emergence of Thinking'
      },
      {
        q: 'Why is distillation preferred over training smaller models from scratch?',
        a: 'Reasoning patterns discovered by larger models via extensive RL can be distilled into compact 1.5B–14B models. These student models acquire mature chain-of-thought structures in orders of magnitude fewer GPU hours.',
        citation: '§4.2, Distillation Results'
      }
    ]
  }
];

// Feature Bento Grid
const BENTO_FEATURES = [
  {
    icon: Shield,
    tag: 'INTEGRITY GUARANTEE',
    title: 'Zero-Hallucination Grounding',
    description: 'Every answer is strictly constrained to your vectorized documents. If an insight cannot be mathematically proven by your source chunks, Chithhi LM declines to fabricate.',
    highlight: 'Cosine Similarity Threshold: ≥ 0.82',
    colSpan: 'md:col-span-2',
  },
  {
    icon: Sparkles,
    tag: 'AUTONOMOUS SYNTHESIS',
    title: 'Instant Executive Briefs',
    description: 'Upon uploading any document, the background engine immediately drafts an executive abstract, extracting core methodologies, findings, and study hypotheses.',
    highlight: 'Zero Prompting Required',
    colSpan: 'md:col-span-1',
  },
  {
    icon: Layers,
    tag: 'MULTI-SOURCE COGNITION',
    title: 'Cross-Document Correlation',
    description: 'Query across 10+ papers, textbook chapters, and web articles in a single dialogue. Synthesize agreements and contradictions effortlessly.',
    highlight: 'Unified Multi-Vector Space',
    colSpan: 'md:col-span-1',
  },
  {
    icon: Database,
    tag: 'SELF-HOSTABLE & OPEN',
    title: 'Complete Vector Sovereignty',
    description: 'Built on transparent open-source foundations: Qdrant Vector DB, LangChain, Express, and Vite. Your private research never leaves your domain.',
    highlight: '100% Open Source Architecture',
    colSpan: 'md:col-span-2',
  },
];

// Workflow Steps
const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Ingest Multi-Format Artifacts',
    description: 'Drag and drop PDFs, DOCX manuscripts, CSV datasets, TXT notes, or paste live web URLs. Files are automatically chunked and vectorized.',
    icon: Upload,
  },
  {
    step: '02',
    title: 'Autonomous Editorial Distillation',
    description: 'The ingestion worker extracts structure, generates an executive brief, and maps semantic relationships into high-dimensional vector space.',
    icon: FileCheck,
  },
  {
    step: '03',
    title: 'Grounded Dialogue with Exact Citations',
    description: 'Conduct high-level interrogation. Every factual assertion is tagged with an inline citation pill pointing directly to the exact source paragraph.',
    icon: MessageSquare,
  },
];

// Comparison Matrix
const COMPARISON_ITEMS = [
  {
    feature: 'Mathematical Source Grounding',
    chithhi: 'Strict Cosine Vector Constraint',
    generic: 'Probabilistic / Hallucinates',
    pdfReader: 'Keyword string match only',
  },
  {
    feature: 'Inline Citation Attribution',
    chithhi: 'Exact page & snippet pill',
    generic: 'Vague or non-existent',
    pdfReader: 'Manual jump to page',
  },
  {
    feature: 'Multi-Document Cross-Synthesis',
    chithhi: 'Simultaneous cross-referencing',
    generic: 'Limited prompt window',
    pdfReader: 'Single file isolation',
  },
  {
    feature: 'Autonomous Upload Summary',
    chithhi: 'Instant on ingestion',
    generic: 'Requires explicit prompting',
    pdfReader: 'None',
  },
  {
    feature: 'Data Ownership & Sovereignty',
    chithhi: 'Open Source · Self-hostable',
    generic: 'Closed proprietary cloud silo',
    pdfReader: 'Local reader only',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeStore();

  // Interactive preview state
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'hypotheses'
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [showCitationDetails, setShowCitationDetails] = useState(false);

  const currentDoc = SAMPLE_DOCS[activeDocIndex];
  const currentQA = currentDoc.sampleQuestions[activeQuestionIndex] || currentDoc.sampleQuestions[0];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground relative overflow-x-hidden">
      {/* Ambient background glow */}
      <div className="ambient-glow" />

      {/* Top Notification / Announcement Bar */}
      <div className="border-b border-border/70 bg-muted/40 py-2 px-4 text-center relative z-20">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-foreground font-semibold">Chithhi LM 1.2:</span>
          <span>Source-Grounded RAG with Qdrant Vector Intelligence.</span>
          <a
            href="https://github.com/Yasho321/NotebookLM-Clone"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline underline-offset-4 ml-1 inline-flex items-center gap-0.5 font-semibold"
          >
            GitHub Repo <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>
        </div>
      </div>

      {/* Sticky Glassmorphic Navigation */}
      <header className="sticky top-0 z-50 glass-header border-b border-border/80 px-6 sm:px-10 py-3.5 transition-all">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Brand Lockup */}
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <img
              src="/logo.png"
              alt="Chithhi LM Logo"
              className="w-8 h-8 object-contain drop-shadow-xs dark:drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)] group-hover:scale-105 transition-transform duration-200 flex-shrink-0"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-foreground tracking-tight font-semibold text-base group-hover:text-foreground/90 transition-colors">Chithhi</span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/70">
                LM
              </span>
            </div>
          </div>

          {/* Desktop Navigation Anchors */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Interactive Preview
            </button>
            <button
              onClick={() => document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Capabilities
            </button>
            <button
              onClick={() => document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Workflow
            </button>
            <button
              onClick={() => document.getElementById('comparison')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-xs font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Comparison
            </button>
          </nav>

          {/* Action Area */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors rounded-lg cursor-pointer"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <Button
              onClick={() => navigate('/auth')}
              size="sm"
              className="h-9 px-4 text-xs font-medium tracking-wide shadow-xs"
            >
              Open Workspace <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 px-6 max-w-5xl mx-auto text-center z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/80 bg-muted/50 mb-8 animate-fade-in-up">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--accent)' }}>
            AI-POWERED SYNTHESIS FOR SERIOUS RESEARCH
          </span>
        </div>

        <h1
          className="text-foreground tracking-tight font-semibold leading-[1.08] mb-8 animate-fade-in-up delay-100"
          style={{ fontSize: 'clamp(38px, 6vw, 68px)', letterSpacing: '-0.035em' }}
        >
          Turn dense documents into clear, <span className="underline decoration-accent/60 underline-offset-8">grounded dialogue</span>.
        </h1>

        <p className="text-muted-foreground text-body md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-200">
          Upload research papers, textbooks, and web fragments. Extract instant executive summaries, interrogate multi-document context, and receive answers strictly verified with exact citations.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14 animate-fade-in-up delay-300">
          <Button
            onClick={() => navigate('/auth')}
            size="lg"
            className="h-12 px-8 text-sm font-medium tracking-normal shadow-sm"
          >
            Launch Research Workspace <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth' })}
            className="h-12 px-8 text-sm font-medium tracking-normal shadow-xs"
          >
            Explore Interactive Demo
          </Button>
        </div>

        {/* Supported Document Types Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground animate-fade-in-up delay-400">
          <span className="font-semibold uppercase tracking-wider text-[11px] mr-1">Supported Formats:</span>
          {['PDF Papers', 'DOCX Manuscripts', 'CSV Datasets', 'TXT Notes', 'Web URLs'].map((format) => (
            <span
              key={format}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-muted/60 border border-border/80 font-medium text-foreground text-xs"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              {format}
            </span>
          ))}
        </div>
      </section>

      {/* Interactive Workspace Simulator (Centerpiece) */}
      <section id="preview" className="px-6 py-12 max-w-6xl mx-auto w-full z-10 scroll-mt-20">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--accent)' }}>
            LIVE WORKSPACE SIMULATOR
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Experience the 3-panel research environment
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
            Click across papers and sample questions below to preview real-time synthesis and citation grounding.
          </p>
        </div>

        {/* Window Chrome / Frame */}
        <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden transition-all">
          {/* Top Window Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
              </div>
              <div className="h-4 w-px bg-border/80 mx-2 hidden sm:block" />
              <span className="text-muted-foreground font-mono text-[11px] hidden sm:inline">
                chithhi-lm / workspace / {currentDoc.title}.pdf
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Qdrant DB: Active
              </span>
            </div>
          </div>

          {/* 3-Column Interactive Layout */}
          <div className="grid grid-cols-1 md:grid-cols-12 min-h-[520px] divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Column 1: Source Library (3 cols) */}
            <div className="md:col-span-3 p-4 bg-muted/20 flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Source Library
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  3 Ingested
                </span>
              </div>
              <div className="space-y-2 flex-1">
                {SAMPLE_DOCS.map((doc, idx) => {
                  const isSelected = activeDocIndex === idx;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        setActiveDocIndex(idx);
                        setActiveQuestionIndex(0);
                        setShowCitationDetails(false);
                      }}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-background border-foreground/30 shadow-xs ring-1 ring-foreground/10'
                          : 'border-border/80 bg-card/60 hover:bg-muted/60'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate text-foreground leading-snug">
                            {doc.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {doc.authors}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-muted-foreground">
                            <span>{doc.type}</span>
                            <span>·</span>
                            <span>{doc.size}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-border/80">
                <Button
                  onClick={() => navigate('/auth')}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Document
                </Button>
              </div>
            </div>

            {/* Column 2: Document Synthesis View (5 cols) */}
            <div className="md:col-span-5 p-5 bg-background flex flex-col">
              {/* Header Info */}
              <div className="border-b border-border pb-4 mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {currentDoc.type}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    {currentDoc.score}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-foreground tracking-tight leading-snug">
                  {currentDoc.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentDoc.authors}
                </p>
              </div>

              {/* Tab Selector */}
              <div className="flex gap-2 mb-4 bg-muted/50 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`flex-1 py-1 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
                    activeTab === 'summary' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Executive Brief
                </button>
                <button
                  onClick={() => setActiveTab('hypotheses')}
                  className={`flex-1 py-1 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
                    activeTab === 'hypotheses' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Core Hypotheses
                </button>
              </div>

              {/* Dynamic Content */}
              <div className="flex-1 overflow-y-auto text-xs leading-relaxed text-muted-foreground space-y-3 pr-1">
                {activeTab === 'summary' ? (
                  <div>
                    <p className="text-foreground font-medium mb-2">Abstract & Synthesis:</p>
                    <p className="mb-3">{currentDoc.abstract}</p>
                    <div className="p-3 rounded-md bg-muted/40 border border-border text-[11px]">
                      <span className="font-semibold text-foreground block mb-1">Indexed Representation:</span>
                      <span>Parsed into {currentDoc.chunks}. Chunk embeddings normalized in Qdrant collections with dense vector indexing.</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-foreground font-medium mb-1">Key Hypotheses & Takeaways:</p>
                    {currentDoc.hypotheses.map((h, i) => (
                      <div key={i} className="flex gap-2 p-2 rounded bg-muted/30 border border-border/70">
                        <span className="text-accent font-semibold flex-shrink-0">0{i + 1}.</span>
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Grounded Dialogue Simulation (4 cols) */}
            <div className="md:col-span-4 p-5 bg-muted/10 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Grounded Dialogue
                </span>
                <span className="text-[10px] text-accent font-semibold">Strict RAG</span>
              </div>

              {/* Conversation Area */}
              <div className="flex-1 flex flex-col justify-between space-y-4">
                {/* User Message */}
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-primary text-primary-foreground p-3 rounded-lg text-xs max-w-[90%] shadow-xs">
                      {currentQA.q}
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex justify-start">
                    <div className="bg-card border border-border p-3.5 rounded-lg text-xs leading-relaxed max-w-[95%] shadow-xs space-y-2">
                      <p className="text-foreground">{currentQA.a}</p>

                      {/* Citation Badge */}
                      <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-[11px]">
                        <button
                          onClick={() => setShowCitationDetails(!showCitationDetails)}
                          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline cursor-pointer"
                        >
                          <Quote className="w-3 h-3" />
                          <span>{currentQA.citation}</span>
                        </button>
                        <span className="text-muted-foreground text-[10px]">Verified Source</span>
                      </div>

                      {showCitationDetails && (
                        <div className="p-2 rounded bg-muted/80 text-[10px] text-muted-foreground border border-border animate-fade-in-up">
                          Extracted from dense chunk #{activeDocIndex * 3 + 4} with high cosine relevance.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sample Prompt Selector */}
                <div className="pt-3 border-t border-border space-y-2">
                  <span className="text-[11px] text-muted-foreground block font-medium">
                    Try questioning this paper:
                  </span>
                  <div className="space-y-1.5">
                    {currentDoc.sampleQuestions.map((qa, qIdx) => (
                      <button
                        key={qIdx}
                        onClick={() => {
                          setActiveQuestionIndex(qIdx);
                          setShowCitationDetails(false);
                        }}
                        className={`w-full text-left text-xs p-2 rounded-md border transition-all cursor-pointer ${
                          activeQuestionIndex === qIdx
                            ? 'bg-background text-foreground border-foreground/30 font-medium'
                            : 'bg-card/70 text-muted-foreground hover:text-foreground border-border/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate mr-2">{qa.q}</span>
                          <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-60" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Phase Workflow Section */}
      <section id="workflow" className="px-6 py-20 max-w-6xl mx-auto w-full z-10 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--accent)' }}>
            RESEARCH PIPELINE
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            From raw manuscript to cited intellect
          </h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            A frictionless, automated pipeline built from the ground up for high-precision literature analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {WORKFLOW_STEPS.map((step) => (
            <div
              key={step.step}
              className="p-8 rounded-xl border border-border/80 bg-card hover-lift transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-xl font-bold" style={{ color: 'var(--accent)' }}>
                    {step.step}
                  </span>
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
                    <step.icon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3 tracking-tight">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bento Grid Capabilities Matrix */}
      <section id="capabilities" className="px-6 py-20 bg-muted/20 border-y border-border/70 z-10 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--accent)' }}>
              CORE ENGINE CAPABILITIES
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              Engineered for absolute accuracy
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Standard chatbots guess. Chithhi LM calculates, verifies, and attributes every sentence to your source data.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {BENTO_FEATURES.map((bento) => (
              <div
                key={bento.title}
                className={`${bento.colSpan} p-8 rounded-xl border border-border/80 bg-card hover-lift transition-all flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <bento.icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <span className="text-label" style={{ color: 'var(--accent)', fontSize: '11px' }}>
                      {bento.tag}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3 tracking-tight">
                    {bento.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    {bento.description}
                  </p>
                </div>
                <div className="pt-4 border-t border-border/60">
                  <span className="text-xs font-mono font-medium text-foreground bg-muted px-2.5 py-1 rounded-md">
                    {bento.highlight}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Matrix: Why Chithhi LM */}
      <section id="comparison" className="px-6 py-20 max-w-5xl mx-auto w-full z-10 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--accent)' }}>
            OBJECTIVE COMPARISON
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Why researchers switch to Chithhi LM
          </h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            See how purpose-built RAG synthesis compares to general chatbots and legacy PDF viewers.
          </p>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="py-4 px-5 font-semibold text-foreground uppercase tracking-wider text-[11px]">
                    Capability
                  </th>
                  <th className="py-4 px-5 font-semibold text-foreground uppercase tracking-wider text-[11px] bg-accent/10 border-x border-accent/20">
                    Chithhi LM (RAG)
                  </th>
                  <th className="py-4 px-5 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                    Generic Chatbots
                  </th>
                  <th className="py-4 px-5 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                    Standard PDF Readers
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARISON_ITEMS.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-5 font-medium text-foreground">
                      {item.feature}
                    </td>
                    <td className="py-4 px-5 font-semibold text-foreground bg-accent/5 border-x border-accent/10">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5" />
                        <span>{item.chithhi}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-muted-foreground">
                      {item.generic}
                    </td>
                    <td className="py-4 px-5 text-muted-foreground">
                      {item.pdfReader}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* High-Conversion Bottom Call-To-Action Banner */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full z-10">
        <div className="p-10 md:p-14 rounded-2xl border border-border/80 bg-gradient-to-b from-card to-muted/40 shadow-xl text-center relative overflow-hidden">
          <div className="max-w-2xl mx-auto relative z-10">
            <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="Chithhi LM Logo"
                className="w-16 h-16 object-contain drop-shadow-md dark:drop-shadow-[0_4px_16px_rgba(255,255,255,0.18)] hover:scale-105 transition-transform duration-200"
              />
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-4">
              Begin your source-grounded research now
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mb-8 leading-relaxed">
              No subscription paywalls. No black-box training silos. Ingest your first academic paper or document in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                onClick={() => navigate('/auth')}
                size="lg"
                className="h-12 px-8 text-sm font-medium tracking-normal shadow-sm"
              >
                Access Research Workspace <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
                className="h-12 px-8 text-sm font-medium tracking-normal shadow-xs"
              >
                <a
                  href="https://github.com/Yasho321/NotebookLM-Clone"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Star on GitHub ★
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer className="border-t border-border mt-auto px-8 py-12 bg-background z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Chithhi LM Logo"
              className="w-7 h-7 object-contain drop-shadow-xs dark:drop-shadow-[0_2px_8px_rgba(255,255,255,0.12)] flex-shrink-0"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-foreground tracking-tight font-semibold text-sm">Chithhi LM</span>
              <span className="text-[10px] text-muted-foreground font-mono">v1.2.0</span>
            </div>
            <span className="text-muted-foreground text-xs hidden sm:inline">
              · Open-Source Research Intelligence
            </span>
          </div>

          <div className="flex items-center gap-8 text-xs text-muted-foreground">
            <a
              href="https://github.com/Yasho321/NotebookLM-Clone"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub Source
            </a>
            <a
              href="https://notebook-lm-clone-one.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Production Demo
            </a>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              Back to Top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
