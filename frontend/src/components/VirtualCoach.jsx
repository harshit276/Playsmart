import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { MessageCircle, X, Send, Sparkles, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

const SUGGESTIONS = [
  "Best badminton racket under 2000 rupees?",
  "How do I improve my tennis serve?",
  "Which paddle for an intermediate table tennis player?",
  "Best shoes for a beginner badminton doubles player",
];

const STORAGE_KEY = "athlytic_coach_history_v1";

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch { return []; }
}

function saveHistory(messages) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  } catch {}
}

// Lightweight markdown → React renderer.
// Supports: **bold**, _italic_, [text](url), inline newlines, "- " bullet lists.
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split(/\n/);
  const blocks = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 my-2">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      listBuffer.push(bulletMatch[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      blocks.push(<div key={`gap-${i}`} className="h-2" />);
    } else {
      blocks.push(
        <p key={`p-${i}`} className="leading-relaxed">{renderInline(line)}</p>
      );
    }
  }
  flushList();
  return <div className="space-y-1">{blocks}</div>;
}

function renderInline(line) {
  // Combined regex: links [text](url) | bold **x** | italic _x_
  const tokens = [];
  const re = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(_([^_]+)_)/g;
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIdx) tokens.push(line.slice(lastIdx, m.index));
    if (m[1]) {
      const txt = m[2];
      const url = m[3];
      const isInternal = url.startsWith("/");
      tokens.push(
        isInternal ? (
          <Link key={key++} to={url} className="text-lime-400 hover:underline font-medium">
            {txt}
          </Link>
        ) : (
          <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
             className="text-lime-400 hover:underline font-medium">
            {txt}
          </a>
        )
      );
    } else if (m[4]) {
      tokens.push(<strong key={key++} className="text-white font-semibold">{m[5]}</strong>);
    } else if (m[6]) {
      tokens.push(<em key={key++} className="italic text-zinc-300">{m[7]}</em>);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < line.length) tokens.push(line.slice(lastIdx));
  return tokens;
}

export default function VirtualCoach() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => loadHistory());
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Hide on routes where it would be in the way
  const HIDDEN_ROUTES = ["/auth", "/label", "/test-model"];
  const hidden = HIDDEN_ROUTES.some((p) => location.pathname.startsWith(p));

  useEffect(() => { saveHistory(messages); }, [messages]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const ask = async (question) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    const next = [...messages, { role: "user", text: q }];
    setMessages(next);
    setLoading(true);
    try {
      const { data } = await api.post("/coach/ask", { question: q });
      setMessages([...next, { role: "coach", text: data.answer, sources: data.sources || [] }]);
    } catch (err) {
      setMessages([...next, {
        role: "coach",
        text: "Sorry, I couldn't reach the coach right now. Please try again in a moment.",
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  const reset = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (hidden) return null;

  // ─── Floating button (collapsed) ───
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Virtual Coach"
        className="fixed bottom-5 right-5 z-40 group flex items-center gap-2 bg-lime-400 hover:bg-lime-300 text-black rounded-full pl-3 pr-4 py-3 shadow-2xl shadow-lime-400/30 transition-all hover:scale-105 active:scale-95"
      >
        <div className="relative">
          <Sparkles className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        </div>
        <span className="text-sm font-semibold hidden sm:inline">Ask Coach</span>
      </button>
    );
  }

  // ─── Chat panel (open) ───
  return (
    <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 flex sm:items-end sm:justify-end pointer-events-none">
      <div className="pointer-events-auto bg-zinc-900 border border-zinc-700/80 sm:rounded-2xl shadow-2xl shadow-black/60 w-full sm:w-[400px] max-h-screen sm:max-h-[600px] flex flex-col h-full sm:h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-gradient-to-r from-lime-400/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-lime-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-black" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Virtual Coach</p>
              <p className="text-[10px] text-zinc-500 leading-tight">Equipment · Training · Sports Q&A</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm"
                onClick={reset}
                className="h-7 px-2 text-[10px] text-zinc-500 hover:text-zinc-300">
                Clear
              </Button>
            )}
            <button onClick={() => setOpen(false)}
              aria-label="Close coach"
              className="text-zinc-500 hover:text-white p-1.5 hover:bg-zinc-800 rounded-lg">
              <ChevronDown className="w-4 h-4 sm:hidden" />
              <X className="w-4 h-4 hidden sm:block" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm text-zinc-200">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="bg-zinc-800/60 rounded-xl px-4 py-3 border border-zinc-800">
                <p className="text-white font-medium mb-1">Hey, I'm your Virtual Coach</p>
                <p className="text-xs text-zinc-400">
                  Ask me about equipment, training plans, technique, or anything sports-related.
                  I'll point you to specific products and guides from our database.
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 px-1 pt-1">Try asking</p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s}
                    onClick={() => ask(s)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:border-lime-400/30 text-zinc-300 hover:text-white transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] bg-lime-400 text-black rounded-2xl rounded-br-md px-3.5 py-2 text-sm font-medium"
                    : `max-w-[92%] ${m.error ? "bg-red-500/10 border border-red-500/30" : "bg-zinc-800/70 border border-zinc-800"} rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-zinc-100`
                }
              >
                {m.role === "user" ? m.text : renderMarkdown(m.text)}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-zinc-700/50">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {m.sources.slice(0, 4).map((s, j) => {
                        if (!s.url) return null;
                        const isInternal = s.url.startsWith("/");
                        const label = s.title ? (s.title.length > 28 ? s.title.slice(0, 28) + "…" : s.title) : s.kind;
                        return isInternal ? (
                          <Link key={j} to={s.url}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 hover:bg-zinc-700 text-zinc-300 hover:text-white">
                            {label}
                          </Link>
                        ) : (
                          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 hover:bg-zinc-700 text-zinc-300 hover:text-white">
                            {label} ↗
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800/70 border border-zinc-800 rounded-2xl rounded-bl-md px-3.5 py-2.5 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-lime-400 animate-spin" />
                <span className="text-xs text-zinc-400">Coach is thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-zinc-800">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about a racket, drill, technique…"
              rows={1}
              className="flex-1 resize-none bg-zinc-800 border border-zinc-700 focus:border-lime-400/60 focus:outline-none rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 max-h-32"
            />
            <Button
              onClick={() => ask()}
              disabled={!input.trim() || loading}
              className="h-9 w-9 p-0 bg-lime-400 hover:bg-lime-300 text-black disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1.5 px-1">
            Coach can occasionally be wrong. Verify prices before buying.
          </p>
        </div>
      </div>
    </div>
  );
}
