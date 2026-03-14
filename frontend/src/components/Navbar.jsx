import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Zap, Menu, User, LogOut, BarChart3, Dumbbell, Target, CreditCard } from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { path: "/equipment", label: "Equipment", icon: Target },
  { path: "/training", label: "Training", icon: Dumbbell },
  { path: "/progress", label: "Progress", icon: BarChart3 },
  { path: "/card", label: "My Card", icon: CreditCard },
];

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (location.pathname === "/" || location.pathname === "/auth") return null;

  return (
    <nav className="sticky top-0 z-50 glass" data-testid="navbar">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-16">
        <Link to="/dashboard" className="flex items-center gap-2 group" data-testid="nav-logo">
          <Zap className="w-6 h-6 text-lime-400" strokeWidth={2.5} />
          <span className="font-heading font-bold text-xl tracking-tight uppercase text-white">PlaySmart</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {isAuthenticated && NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path} data-testid={`nav-${label.toLowerCase()}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === path ? "text-lime-400 bg-lime-400/10" : "text-zinc-400 hover:text-lime-400 hover:bg-lime-400/5"
              }`}>
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full border border-zinc-800 hover:border-lime-400/50" data-testid="user-menu-btn">
                  <User className="w-4 h-4 text-zinc-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                <DropdownMenuItem className="text-zinc-400 text-xs focus:bg-zinc-800">{user?.phone}</DropdownMenuItem>
                <DropdownMenuItem className="text-zinc-400 focus:bg-zinc-800 cursor-pointer" onClick={() => { logout(); navigate("/"); }} data-testid="logout-btn">
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth")} className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full" data-testid="nav-login-btn">Login</Button>
          )}

          <Button variant="ghost" size="icon" className="md:hidden text-zinc-400" onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {mobileOpen && isAuthenticated && (
        <div className="md:hidden border-t border-zinc-800 px-4 pb-4 pt-2 space-y-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                location.pathname === path ? "text-lime-400 bg-lime-400/10" : "text-zinc-400"
              }`}>
              <Icon className="w-4 h-4" strokeWidth={1.5} /> {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
