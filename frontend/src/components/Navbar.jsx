import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Menu, User, LogOut, BarChart3, Dumbbell, Target, CreditCard,
  Video, Users, X, Flame, Film, BookOpen
} from "lucide-react";
import { useState, useEffect } from "react";
import { getSportEmoji, getSportLabel } from "@/lib/sportConfig";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { path: "/analyze", label: "Analyze", icon: Video },
  { path: "/highlights", label: "Highlights", icon: Film },
  { path: "/equipment", label: "Equipment", icon: Target },
  { path: "/training", label: "Training", icon: Dumbbell },
  { path: "/community", label: "Community", icon: Users },
  { path: "/progress", label: "Progress", icon: BarChart3 },
  { path: "/card", label: "My Card", icon: CreditCard },
];

const SPORT_ACCENT = {
  badminton: "lime",
  table_tennis: "sky",
  swimming: "blue",
  cricket: "green",
  pickleball: "emerald",
  football: "orange",
  tennis: "amber",
};

const ACCENT_CLASSES = {
  lime: { active: "text-lime-400 bg-lime-400/10", hover: "hover:text-lime-400 hover:bg-lime-400/5", logo: "text-lime-400", border: "border-lime-400/20" },
  sky: { active: "text-sky-400 bg-sky-400/10", hover: "hover:text-sky-400 hover:bg-sky-400/5", logo: "text-sky-400", border: "border-sky-400/20" },
  blue: { active: "text-blue-400 bg-blue-400/10", hover: "hover:text-blue-400 hover:bg-blue-400/5", logo: "text-blue-400", border: "border-blue-400/20" },
  green: { active: "text-green-400 bg-green-400/10", hover: "hover:text-green-400 hover:bg-green-400/5", logo: "text-green-400", border: "border-green-400/20" },
  emerald: { active: "text-emerald-400 bg-emerald-400/10", hover: "hover:text-emerald-400 hover:bg-emerald-400/5", logo: "text-emerald-400", border: "border-emerald-400/20" },
  orange: { active: "text-orange-400 bg-orange-400/10", hover: "hover:text-orange-400 hover:bg-orange-400/5", logo: "text-orange-400", border: "border-orange-400/20" },
  amber: { active: "text-amber-400 bg-amber-400/10", hover: "hover:text-amber-400 hover:bg-amber-400/5", logo: "text-amber-400", border: "border-amber-400/20" },
};

export default function Navbar() {
  const { isAuthenticated, user, profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (location.pathname === "/" || location.pathname === "/auth") return null;

  const activeSport = profile?.active_sport || "badminton";
  const accentKey = SPORT_ACCENT[activeSport] || "lime";
  const accent = ACCENT_CLASSES[accentKey];
  const streak = 0; // Will be populated from profile if available

  return (
    <>
      <nav className="sticky top-0 z-50 glass" data-testid="navbar">
        <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-14 sm:h-16">
          <Link to="/dashboard" className="flex items-center gap-2 group" data-testid="nav-logo">
            <Zap className={`w-5 h-5 sm:w-6 sm:h-6 ${accent.logo}`} strokeWidth={2.5} />
            <span className="font-heading font-bold text-lg sm:text-xl tracking-tight uppercase text-white">AthlyticAI</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {isAuthenticated && NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path} data-testid={`nav-${label.toLowerCase()}`}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  location.pathname === path ? accent.active : `text-zinc-400 ${accent.hover}`
                }`}>
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                {label}
              </Link>
            ))}
            <Link to="/blog" data-testid="nav-blog"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                location.pathname.startsWith("/blog") ? accent.active : `text-zinc-400 ${accent.hover}`
              }`}>
              <BookOpen className="w-4 h-4" strokeWidth={1.5} />
              Blog
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Streak badge (desktop) */}
            {isAuthenticated && profile && (
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-amber-400/10 rounded-full">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-400">{streak}</span>
              </div>
            )}

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"
                    className={`rounded-full border border-zinc-800 hover:${accent.border} h-8 w-8 sm:h-9 sm:w-9`}
                    data-testid="user-menu-btn">
                    <User className="w-4 h-4 text-zinc-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem className="text-zinc-400 text-xs focus:bg-zinc-800">{user?.email}</DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-zinc-400 focus:bg-zinc-800 cursor-pointer"
                    onClick={() => { logout(); navigate("/"); }}
                    data-testid="logout-btn"
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" onClick={() => navigate("/auth")}
                className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs sm:text-sm"
                data-testid="nav-login-btn">
                Login
              </Button>
            )}

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-zinc-400 h-8 w-8"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-in drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 w-72 bg-zinc-950 border-l border-zinc-800 z-50 md:hidden overflow-y-auto"
            >
              <div className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Zap className={`w-5 h-5 ${accent.logo}`} strokeWidth={2.5} />
                    <span className="font-heading font-bold text-lg tracking-tight uppercase text-white">Menu</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-zinc-400 h-8 w-8"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                {/* Streak display */}
                {profile && (
                  <div className="flex items-center gap-2 mb-6 bg-amber-400/5 rounded-xl p-3">
                    <Flame className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-bold text-white">{streak} Day Streak</p>
                      <p className="text-[10px] text-zinc-500">Keep it going!</p>
                    </div>
                  </div>
                )}

                {/* Nav items */}
                <div className="space-y-1">
                  {isAuthenticated && NAV_ITEMS.map(({ path, label, icon: Icon }) => (
                    <Link
                      key={path}
                      to={path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        location.pathname === path
                          ? accent.active
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      }`}
                    >
                      <Icon className="w-5 h-5" strokeWidth={1.5} />
                      {label}
                    </Link>
                  ))}
                  <Link
                    to="/blog"
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      location.pathname.startsWith("/blog")
                        ? accent.active
                        : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                    }`}
                  >
                    <BookOpen className="w-5 h-5" strokeWidth={1.5} />
                    Blog
                  </Link>
                </div>

                {/* Sport info */}
                {profile && (
                  <div className="mt-6 pt-6 border-t border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2 px-4">Active Sport</p>
                    <div className="px-4 flex items-center gap-2">
                      <Badge className={`${accent.active} text-xs`}>
                        {getSportEmoji(profile.active_sport)} {getSportLabel(profile.active_sport)}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Logout */}
                {isAuthenticated && (
                  <div className="mt-6 pt-6 border-t border-zinc-800">
                    <button
                      onClick={() => { logout(); navigate("/"); setMobileOpen(false); }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-400/5 transition-colors w-full"
                    >
                      <LogOut className="w-5 h-5" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
