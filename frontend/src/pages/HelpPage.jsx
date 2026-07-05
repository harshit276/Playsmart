/**
 * HelpPage — public contact + FAQ. Submits a support ticket to
 * /api/support/contact which persists + pings admin on Telegram.
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  HelpCircle, MessageCircle, Mail, Send, CheckCircle2, Loader2,
  Coins, Camera, Users, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import SEO from "@/components/SEO";

const CATEGORIES = [
  { key: "bug", label: "Bug / website issue", icon: HelpCircle },
  { key: "account", label: "Sign in / account", icon: Users },
  { key: "payment", label: "Payment / tokens", icon: Coins },
  { key: "analysis", label: "Video analysis", icon: Camera },
  { key: "equipment", label: "Equipment / order", icon: ShoppingCart },
  { key: "feedback", label: "Feature request", icon: MessageCircle },
  { key: "other", label: "Other", icon: HelpCircle },
];

const FAQS = [
  {
    q: "How do tokens work?",
    a: "Each video analysis costs 100 tokens. You get 300 free on signup (3 free analyses). Earn more by referring friends (200 each side), hosting community games (50/game), or completing training days (20/day). Tokens never expire.",
  },
  {
    q: "Will I be charged tokens if my analysis fails?",
    a: "No. Tokens are only deducted after the analysis succeeds. If the server errors out, you don't pay.",
  },
  {
    q: "Is my video data private?",
    a: "Most of the analysis runs in your browser via TensorFlow.js — your raw video never leaves your device. The summary stats (shot type, technique scores) are sent to our backend for coaching feedback only.",
  },
  {
    q: "How do I cancel a token purchase?",
    a: "Token purchases are non-refundable once consumed. If you bought tokens but haven't used them, contact us at the email below within 7 days for a refund.",
  },
  {
    q: "Why can't I find a real product image on the marketplace?",
    a: "We're partnered with Amazon Associates but don't yet have direct API access for all products. The brand-name placeholder is intentional until we get product photos for every listing.",
  },
];

export default function HelpPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    subject: "",
    message: "",
    category: "bug",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { document.title = "Help & Support · Formanti"; }, []);

  // Re-prime form when user changes
  useEffect(() => {
    setForm((f) => ({ ...f, name: user?.name || f.name, email: user?.email || f.email }));
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || form.message.trim().length < 5) {
      toast.error("Fill all fields (message at least 5 characters)");
      return;
    }
    setSending(true);
    try {
      await api.post("/support/contact", form, { timeout: 12000 });
      setSent(true);
      toast.success("Sent — we'll get back to you within 24 hours.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send. Try email instead.");
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <SEO
        title="Help & Customer Support · Formanti"
        description="Contact Formanti customer care. Get help with sign-in, tokens, video analysis, equipment orders, or report a bug."
      />
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-lime-400/10 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="w-7 h-7 text-lime-400" />
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-white uppercase tracking-tight">
              Help & Support
            </h1>
          </div>
          <p className="text-zinc-300 text-sm">
            We typically reply within <span className="text-lime-400 font-medium">24 hours</span>.
            For urgent issues, email <a href="mailto:hello@formanti.com" className="underline text-lime-300">hello@formanti.com</a>.
          </p>
        </motion.div>

        {/* Contact form OR success state */}
        {sent ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900/80 border border-lime-400/30 rounded-2xl p-8 text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-lime-400/15 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-lime-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Message sent!</h2>
            <p className="text-zinc-400 text-sm mb-4">
              We've received your message and will reply to <span className="text-white">{form.email}</span> within 24 hours.
            </p>
            <Button onClick={() => { setSent(false); setForm((f) => ({ ...f, subject: "", message: "" })); }}
              variant="outline" className="border-zinc-700 text-zinc-300 rounded-full">
              Send another
            </Button>
          </motion.div>
        ) : (
          <motion.form onSubmit={submit} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 mb-6 space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Contact us</p>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c.key} type="button"
                    onClick={() => setForm({ ...form, category: c.key })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                      form.category === c.key
                        ? "bg-lime-400 text-black"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}>
                    <c.icon className="w-3 h-3" /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Your name *</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Email *</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Subject *</label>
              <input type="text" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Brief summary"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none" />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-1">Message *</label>
              <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Describe what happened, what you expected, and any error messages."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none resize-none" />
              <p className="text-[10px] text-zinc-600 mt-1">{form.message.length}/2000</p>
            </div>

            <Button type="submit" disabled={sending}
              className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full h-11">
              {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send message</>}
            </Button>
          </motion.form>
        )}

        {/* Direct contact alternatives */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          <a href="mailto:hello@formanti.com"
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-lime-400/30 transition-colors flex items-start gap-3">
            <Mail className="w-5 h-5 text-lime-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">Email us</p>
              <p className="text-[11px] text-zinc-400">hello@formanti.com</p>
              <p className="text-[10px] text-zinc-500 mt-1">Reply within 24 hours</p>
            </div>
          </a>
          <a href="https://wa.me/919999999999" target="_blank" rel="noopener noreferrer"
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 hover:border-emerald-400/30 transition-colors flex items-start gap-3">
            <MessageCircle className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">WhatsApp</p>
              <p className="text-[11px] text-zinc-400">Chat with us directly</p>
              <p className="text-[10px] text-zinc-500 mt-1">Mon–Sat, 10am–8pm IST</p>
            </div>
          </a>
        </motion.div>

        {/* FAQ */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3 flex items-center gap-1.5">
            <HelpCircle className="w-3 h-3" /> Frequently asked
          </h2>
          <div className="space-y-2">
            {FAQS.map((f, i) => (
              <details key={i} className="group bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-900 list-none">
                  <span className="text-sm font-medium text-white">{f.q}</span>
                  <Badge className="bg-zinc-800 text-zinc-500 text-[10px] group-open:bg-lime-400/15 group-open:text-lime-400">+</Badge>
                </summary>
                <div className="px-4 pb-4 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/50 pt-3">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
