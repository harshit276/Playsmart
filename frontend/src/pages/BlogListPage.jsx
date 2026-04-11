import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Clock, Calendar, ArrowRight, BookOpen } from "lucide-react";
import api from "@/lib/api";
import SEO from "@/components/SEO";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "guides", label: "Guides" },
  { key: "tutorials", label: "Tutorials" },
  { key: "gear", label: "Gear" },
  { key: "training", label: "Training" },
  { key: "tips", label: "Tips" },
];

const SPORTS = [
  { key: "all", label: "All" },
  { key: "badminton", label: "Badminton" },
  { key: "tennis", label: "Tennis" },
  { key: "table-tennis", label: "Table Tennis" },
  { key: "general", label: "General" },
];

const SPORT_GRADIENT = {
  badminton: "from-lime-500/30 to-emerald-600/20",
  tennis: "from-amber-500/30 to-orange-600/20",
  "table-tennis": "from-sky-500/30 to-blue-600/20",
  general: "from-purple-500/30 to-indigo-600/20",
};

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

export default function BlogListPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSport, setActiveSport] = useState("all");

  useEffect(() => {
    document.title = "AthlyticAI Blog - Sports Tips, Training Guides & Gear Reviews";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Expert sports tips, training guides, gear reviews, and tutorials for badminton, tennis, and table tennis players. Improve your game with AthlyticAI.");
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (activeCategory !== "all") params.category = activeCategory;
    if (activeSport !== "all") params.sport = activeSport;
    api.get("/blog", { params })
      .then(({ data }) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [activeCategory, activeSport]);

  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO
        title="Sports Tips, Training Guides & Equipment Reviews"
        description="Expert articles on badminton, tennis, table tennis, and pickleball. Training tips, equipment reviews, technique guides, and video analysis insights from AthlyticAI."
        keywords="badminton tips, tennis training, table tennis guide, pickleball strategy, sports equipment reviews"
        url="https://athlyticai.com/blog"
      />
      {/* Hero */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/80 via-zinc-950 to-zinc-950" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }} />
        <div className="relative z-10 container mx-auto px-4 max-w-5xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/20 mb-6">
              <BookOpen className="w-4 h-4 text-lime-400" />
              <span className="text-sm font-medium text-lime-400">AthlyticAI Blog</span>
            </div>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="font-heading font-black text-4xl sm:text-5xl md:text-6xl tracking-tighter uppercase text-white mb-4">
            Sports Tips & Guides
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="text-zinc-400 text-lg sm:text-xl max-w-2xl mx-auto">
            Expert advice on technique, gear, and training for badminton, tennis, and table tennis players.
          </motion.p>
        </div>
      </section>

      {/* Filters */}
      <section className="container mx-auto px-4 max-w-6xl -mt-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Category pills */}
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 font-medium">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveCategory(key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeCategory === key
                      ? "bg-lime-400 text-black"
                      : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-white"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Sport pills */}
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 font-medium">Sport</p>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveSport(key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeSport === key
                      ? "bg-lime-400 text-black"
                      : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-white"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="container mx-auto px-4 max-w-6xl pb-20">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-lg">No posts found. Try a different filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post, i) => (
              <motion.div key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link to={`/blog/${post.id}`}
                  className="group block bg-zinc-900/50 border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700/60 transition-all hover:shadow-lg hover:shadow-lime-400/5">
                  {/* Thumbnail */}
                  <div className={`relative h-40 bg-gradient-to-br ${SPORT_GRADIENT[post.sport] || SPORT_GRADIENT.general} flex items-center justify-center`}>
                    <span className="text-6xl opacity-80 group-hover:scale-110 transition-transform duration-300">
                      {post.thumbnail_emoji}
                    </span>
                  </div>
                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${CATEGORY_COLOR[post.category] || "bg-zinc-700 text-zinc-300"}`}>
                        {post.category}
                      </span>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${SPORT_COLOR[post.sport] || "bg-zinc-700 text-zinc-300"}`}>
                        {post.sport === "table-tennis" ? "Table Tennis" : post.sport}
                      </span>
                    </div>
                    <h2 className="text-white font-bold text-lg leading-tight mb-2 group-hover:text-lime-400 transition-colors line-clamp-2">
                      {post.title}
                    </h2>
                    <p className="text-zinc-400 text-sm leading-relaxed mb-4 line-clamp-2">
                      {post.description}
                    </p>
                    <div className="flex items-center justify-between text-zinc-500 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(post.published_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {post.read_time}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-lime-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 max-w-3xl pb-20">
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800/50 border border-zinc-700/30 rounded-2xl p-8 sm:p-12 text-center">
          <Zap className="w-10 h-10 text-lime-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-2xl sm:text-3xl mb-3">Ready to Level Up Your Game?</h2>
          <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
            Get AI-powered video analysis, personalized training plans, and equipment recommendations tailored to your playing style.
          </p>
          <Link to="/auth"
            className="inline-flex items-center gap-2 px-6 py-3 bg-lime-400 text-black font-bold rounded-full hover:bg-lime-500 transition-colors">
            Try AthlyticAI Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
