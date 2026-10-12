import { Link } from "react-router-dom";
import { useAuth } from "@/App";
import { FormantiIcon } from "@/components/FormantiLogo";

/**
 * The home page's top bar. The rest of the app has its own navbar, which is hidden on "/" so the hero
 * stays clean, and that left the front door with no way to log in, no link to Practice and a logo that
 * went to a different landing page. This is the slim version: logo, the three places a visitor wants
 * to go, and log in / sign up.
 */
const LINKS = [
  { to: "/analyze", label: "Analyze", phone: false },
  { to: "/practice", label: "Practice", phone: true, isNew: Date.now() < Date.parse("2027-01-15") },
  { to: "/pricing", label: "Pricing", phone: false },
  { to: "/blog", label: "Blog", phone: false },
];

export default function HomeHeader() {
  const { isAuthenticated } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/85 backdrop-blur-md" data-testid="home-header">
      <div className="container mx-auto max-w-6xl px-4 h-14 sm:h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0 min-h-11" aria-label="Formanti home">
          <FormantiIcon className="h-6" />
          <span className="hidden min-[360px]:inline font-heading font-bold text-lg sm:text-xl uppercase tracking-tight text-white">Formanti</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1 ml-auto">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to}
              className={`${l.phone ? "inline-flex" : "hidden md:inline-flex"} items-center gap-1.5 min-h-11 px-2.5 sm:px-3 rounded-lg text-[14px] font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors`}>
              {l.label}
              {l.isNew && <span className="hidden sm:inline text-[9px] font-black uppercase tracking-wide bg-lime-400 text-black rounded px-1 py-px leading-none">New</span>}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isAuthenticated ? (
            <Link to="/dashboard" className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-lime-400 text-black text-[14px] font-bold hover:bg-lime-300 transition-colors">
              Open app
            </Link>
          ) : (
            <>
              <Link to="/auth" className="inline-flex items-center min-h-11 px-2.5 sm:px-3 rounded-lg text-[14px] font-medium text-zinc-200 hover:text-white transition-colors" data-testid="home-login">
                Log in
              </Link>
              <Link to="/auth" className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-lime-400 text-black text-[14px] font-bold hover:bg-lime-300 transition-colors" data-testid="home-signup">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
