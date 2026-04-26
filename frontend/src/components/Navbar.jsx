import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Zap, LogOut, BarChart3, Dumbbell, Target, CreditCard,
  Video, Users, Flame, Film, BookOpen, Home, MoreHorizontal, Swords
} from "lucide-react";
import { useState, useEffect } from "react";
import { getSportEmoji, getSportLabel } from "@/lib/sportConfig";
import { motion, AnimatePresence } from "framer-motion";

// Desktop nav items (shown in top bar)
const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { path: "/analyze", label: "Analyze", icon: Video },
  { path: "/equipment", label: "Equipment", icon: Target },
  { path: "/training", label: "Training", icon: Dumbbell },
  { path: "/community?host=1", label: "Host Game", icon: Swords },
  { path: "/community", label: "Community", icon: Users },
  { path: "/progress", label: "Progress", icon: BarChart3 },
];

// Mobile bottom nav - 5 key items (like Instagram/YouTube)
const MOBILE_NAV_PRIMARY = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/analyze", label: "Analyze", icon: Video },
  { path: "/community?host=1", label: "Host", icon: Swords },
  { path: "/training", label: "Training", icon: Dumbbell },
];

// "More" menu items on mobile
const MOBILE_NAV_MORE = [
  { path: "/equipment", label: "Equipment", icon: Target },
  { path: "/community", label: "Community", icon: Users },
  { path: "/progress", label: "Progress", icon: BarChart3 },
  { path: "/card", label: "My Card", icon: CreditCard },
  { path: "/blog", label: "Blog", icon: BookOpen },
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
  lime: { active: "text-lime-400 bg-lime-400/10", hover: "hover:text-lime-400 hover:bg-lime-400/5", logo: "text-lime-400", border: "border-lime-400/20", dot: "bg-lime-400" },
  sky: { active: "text-sky-400 bg-sky-400/10", hover: "hover:text-sky-400 hover:bg-sky-400/5", logo: "text-sky-400", border: "border-sky-400/20", dot: "bg-sky-400" },
  blue: { active: "text-blue-400 bg-blue-400/10", hover: "hover:text-blue-400 hover:bg-blue-400/5", logo: "text-blue-400", border: "border-blue-400/20", dot: "bg-blue-400" },
  green: { active: "text-green-400 bg-green-400/10", hover: "hover:text-green-400 hover:bg-green-400/5", logo: "text-green-400", border: "border-green-400/20", dot: "bg-green-400" },
  emerald: { active: "text-emerald-400 bg-emerald-400/10", hover: "hover:text-emerald-400 hover:bg-emerald-400/5", logo: "text-emerald-400", border: "border-emerald-400/20", dot: "bg-emerald-400" },
  orange: { active: "text-orange-400 bg-orange-400/10", hover: "hover:text-orange-400 hover:bg-orange-400/5", logo: "text-orange-400", border: "border-orange-400/20", dot: "bg-orange-400" },
  amber: { active: "text-amber-400 bg-amber-400/10", hover: "hover:text-amber-400 hover:bg-amber-400/5", logo: "text-amber-400", border: "border-amber-400/20", dot: "bg-amber-400" },
};

function UserAvatar({ user, accent, size = "sm" }) {
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || user?.phone?.slice(-2) || "U";
  const sizeClasses = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";
  return (
    <div className={`${sizeClasses} rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-white`}>
      {initial}
    </div>
  );
}

export default function Navbar() {
  const { isAuthenticated, user, profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close more menu on navigation
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const isGuest = !isAuthenticated;
  const showNav = true; // Always show navbar on app pages

  if (location.pathname === "/" || location.pathname === "/auth" || location.pathname === "/privacy") return null;

  const activeSport = profile?.active_sport || "badminton";
  const accentKey = SPORT_ACCENT[activeSport] || "lime";
  const accent = ACCENT_CLASSES[accentKey];
  const streak = 0;

  // Check if current path matches a mobile "more" item
  const isMoreActive = MOBILE_NAV_MORE.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + "/"));

  return (
    <>
      {/* ── Top Navigation Bar ── */}
      <nav className="sticky top-0 z-50 glass" data-testid="navbar">
        <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 group" data-testid="nav-logo">
            <Zap className={`w-5 h-5 sm:w-6 sm:h-6 ${accent.logo}`} strokeWidth={2.5} />
            <span className="font-heading font-bold text-lg sm:text-xl tracking-tight uppercase text-white">AthlyticAI</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {showNav && NAV_ITEMS.filter(item => {
              if (isGuest && (item.path === "/community" || item.path === "/card")) return false;
              return true;
            }).map(({ path, label, icon: Icon }) => (
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

          {/* Right side: streak + user menu */}
          <div className="flex items-center gap-2">
            {/* Streak badge */}
            {isAuthenticated && profile && (
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-amber-400/10 rounded-full">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-400">{streak}</span>
              </div>
            )}

            {/* Sign In button for guests */}
            {isGuest && (
              <Button size="sm" onClick={() => {
                localStorage.removeItem("guest_mode");
                navigate("/auth");
              }}
                className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full text-xs sm:text-sm"
                data-testid="nav-signin-btn">
                Sign In
              </Button>
            )}

            {/* User menu */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-zinc-700" data-testid="user-menu-btn">
                    <UserAvatar user={user} accent={accent} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-white">{user?.name || "Player"}</p>
                    <p className="text-xs text-zinc-500">{user?.email || user?.phone}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <DropdownMenuItem
                    className="text-zinc-400 focus:bg-zinc-800 cursor-pointer"
                    onClick={() => navigate("/card")}
                  >
                    <CreditCard className="w-4 h-4 mr-2" /> My Card
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-zinc-400 focus:bg-zinc-800 cursor-pointer"
                    onClick={() => navigate("/progress")}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" /> Progress
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <DropdownMenuItem
                    className="text-red-400 focus:bg-zinc-800 cursor-pointer"
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
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation Bar ── */}
      {showNav && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 mobile-bottom-nav" data-testid="mobile-bottom-nav">
          <div className="flex items-center justify-around h-16 px-1">
            {MOBILE_NAV_PRIMARY.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl transition-colors min-h-[44px] ${
                    isActive ? accent.active : "text-zinc-500"
                  }`}
                  data-testid={`mobile-nav-${label.toLowerCase()}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                  <span className={`text-[10px] font-medium ${isActive ? "" : "text-zinc-500"}`}>{label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-indicator"
                      className={`absolute bottom-1 w-5 h-0.5 rounded-full ${accent.dot}`}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}

            {/* More button */}
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl transition-colors min-h-[44px] ${
                isMoreActive || moreOpen ? accent.active : "text-zinc-500"
              }`}
              data-testid="mobile-nav-more"
            >
              <MoreHorizontal className="w-5 h-5" strokeWidth={(isMoreActive || moreOpen) ? 2 : 1.5} />
              <span className={`text-[10px] font-medium ${(isMoreActive || moreOpen) ? "" : "text-zinc-500"}`}>More</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile "More" Slide-up Sheet ── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-16 left-0 right-0 md:hidden" style={{ zIndex: 45 }}
            >
              <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-2xl overflow-hidden shadow-2xl">
                {/* Handle bar */}
                <div className="flex justify-center py-2">
                  <div className="w-10 h-1 bg-zinc-700 rounded-full" />
                </div>

                <div className="px-4 pb-4 pt-1">
                  {/* Active sport indicator */}
                  {profile && (
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <Badge className={`${accent.active} text-xs`}>
                        {getSportEmoji(profile.active_sport)} {getSportLabel(profile.active_sport)}
                      </Badge>
                      {streak > 0 && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-400/10 rounded-full">
                          <Flame className="w-3 h-3 text-amber-400" />
                          <span className="text-[10px] font-bold text-amber-400">{streak}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* More nav items */}
                  <div className="grid grid-cols-3 gap-2">
                    {MOBILE_NAV_MORE.map(({ path, label, icon: Icon }) => {
                      const isActive = location.pathname === path || location.pathname.startsWith(path + "/");
                      return (
                        <Link
                          key={path}
                          to={path}
                          onClick={() => setMoreOpen(false)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors min-h-[64px] ${
                            isActive ? accent.active : "text-zinc-400 hover:bg-zinc-800"
                          }`}
                        >
                          <Icon className="w-5 h-5" strokeWidth={1.5} />
                          <span className="text-xs font-medium">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
