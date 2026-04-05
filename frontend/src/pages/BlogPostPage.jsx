import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, Share2, Copy, Check, ArrowRight, Zap } from "lucide-react";
import api from "@/lib/api";

const CATEGORY_COLOR = {
  guides: "bg-blue-500/20 text-blue-400",
  tutorials: "bg-purple-500/20 text-purple-400",
  gear: "bg-amber-500/20 text-amber-400",
  training: "bg-emerald-500/20 text-emerald-400",
  tips: "bg-rose-500/20 text-rose-400",
};

const SPORT_COLOR = {
  badminton: "bg-lime-500/20 text-lime-400",
  tennis: "bg-amber-500/20 text-amber-400",
  "table-tennis": "bg-sky-500/20 text-sky-400",
  general: "bg-purple-500/20 text-purple-400",
};

const SPORT_GRADIENT = {
  badminton: "from-lime-500/20 to-emerald-600/10",
  tennis: "from-amber-500/20 to-orange-600/10",
  "table-tennis": "from-sky-500/20 to-blue-600/10",
  general: "from-purple-500/20 to-indigo-600/10",
};

export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/blog/${slug}`)
      .then(({ data }) => {
        setPost(data);
        document.title = `${data.title} | AthlyticAI Blog`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", data.description);
      })
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [slug]);

  // Fetch related posts
  useEffect(() => {
    if (!post) return;
    api.get("/blog")
      .then(({ data }) => {
        const rel = data.filter(p =>
          p.id !== post.id && (p.sport === post.sport || p.category === post.category)
        ).slice(0, 3);
        setRelated(rel);
      })
      .catch(() => setRelated([]));
  }, [post]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = `Check out this article: ${post.title}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-400 text-lg">Post not found.</p>
        <Link to="/blog" className="text-lime-400 hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Blog
        </Link>
      </div>
    );
  }

  const sportLabel = post.sport === "table-tennis" ? "Table Tennis" : post.sport;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header bar */}
      <div className="border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="container mx-auto px-4 max-w-4xl py-4">
          <Link to="/blog" className="inline-flex items-center gap-2 text-zinc-400 hover:text-lime-400 transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>
      </div>

      {/* Article */}
      <article className="container mx-auto px-4 max-w-4xl pt-8 sm:pt-12 pb-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Meta badges */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${CATEGORY_COLOR[post.category] || "bg-zinc-700 text-zinc-300"}`}>
              {post.category}
            </span>
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${SPORT_COLOR[post.sport] || "bg-zinc-700 text-zinc-300"}`}>
              {sportLabel}
            </span>
          </div>

          {/* Title */}
          <h1 className="font-heading font-black text-3xl sm:text-4xl md:text-5xl tracking-tight text-white leading-tight mb-6">
            {post.title}
          </h1>

          {/* Meta info bar */}
          <div className="flex flex-wrap items-center gap-4 text-zinc-400 text-sm mb-8 pb-8 border-b border-zinc-800/50">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(post.published_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {post.read_time}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={handleShareWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/60 text-zinc-400 hover:text-green-400 hover:bg-green-400/10 transition-colors text-xs font-medium">
                <Share2 className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/60 text-zinc-400 hover:text-lime-400 hover:bg-lime-400/10 transition-colors text-xs font-medium">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          {/* Emoji hero */}
          <div className={`bg-gradient-to-br ${SPORT_GRADIENT[post.sport] || SPORT_GRADIENT.general} rounded-2xl flex items-center justify-center py-12 mb-10`}>
            <span className="text-8xl">{post.thumbnail_emoji}</span>
          </div>

          {/* Article content */}
          <div
            className="blog-content max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Tags */}
          <div className="mt-10 pt-6 border-t border-zinc-800/50">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-medium">Tags</p>
            <div className="flex flex-wrap gap-2">
              {post.tags.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full bg-zinc-800/60 text-zinc-400 text-xs font-medium">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </article>

      {/* Related Posts */}
      {related.length > 0 && (
        <section className="border-t border-zinc-800/50 bg-zinc-900/20">
          <div className="container mx-auto px-4 max-w-6xl py-12 sm:py-16">
            <h2 className="font-heading font-bold text-2xl text-white mb-8">Related Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((rp) => (
                <Link key={rp.id} to={`/blog/${rp.id}`}
                  className="group block bg-zinc-900/50 border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700/60 transition-all">
                  <div className={`h-28 bg-gradient-to-br ${SPORT_GRADIENT[rp.sport] || SPORT_GRADIENT.general} flex items-center justify-center`}>
                    <span className="text-4xl opacity-80 group-hover:scale-110 transition-transform duration-300">{rp.thumbnail_emoji}</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${CATEGORY_COLOR[rp.category]}`}>
                        {rp.category}
                      </span>
                    </div>
                    <h3 className="text-white font-bold text-sm leading-tight group-hover:text-lime-400 transition-colors line-clamp-2">
                      {rp.title}
                    </h3>
                    <p className="text-zinc-500 text-xs mt-2">{rp.read_time}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container mx-auto px-4 max-w-3xl py-12 sm:py-16">
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800/50 border border-zinc-700/30 rounded-2xl p-8 sm:p-12 text-center">
          <Zap className="w-10 h-10 text-lime-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-2xl sm:text-3xl mb-3">Ready to Improve Your Game?</h2>
          <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
            Try AthlyticAI free and get AI-powered analysis, personalized training plans, and smart equipment recommendations.
          </p>
          <Link to="/auth"
            className="inline-flex items-center gap-2 px-6 py-3 bg-lime-400 text-black font-bold rounded-full hover:bg-lime-500 transition-colors">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
