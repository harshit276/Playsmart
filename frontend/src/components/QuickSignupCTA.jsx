import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Camera } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/App";
import api from "@/lib/api";
import { trackSignupConversion } from "@/lib/adsConversion";
import { track, trackSignup } from "@/lib/analytics";
import { formatAnalyses } from "@/lib/analyses";

/**
 * QuickSignupCTA — "No clip yet? Get your free analyses now."
 *
 * WHY: every path to an account used to start with "Choose a video". Someone
 * who taps a YouTube ad on their phone is almost never holding a clip of their
 * squat, so they had no way to say yes — 277 ad clicks, 0 signups. This lets
 * them claim the free analyses in one tap now and film at their next session.
 *
 * One-tap Google in a popup. In-app browsers that block popups fall back to
 * the full /auth page (which handles redirect sign-in itself) rather than
 * failing silently.
 *
 * @param {string} source   where it is shown ("gym", …) — analytics only.
 * @param {string} sport    sport slug for the upload page after sign-in.
 * @param {string} [what]   what to film, e.g. "set" / "rally".
 */
export default function QuickSignupCTA({ source, sport, what = "set" }) {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // tokens after signup

  // Signed-in visitors already have the upload box right above this.
  if (isAuthenticated && !done) return null;

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    track("quick_signup_clicked", { source });
    try {
      const { signInWithPopup } = await import("firebase/auth");
      const { auth, googleProvider } = await import("@/lib/firebase");
      const fb = await signInWithPopup(auth, googleProvider);
      const idToken = await fb.user.getIdToken();
      const { data } = await api.post("/auth/firebase", {
        firebase_token: idToken,
        name: fb.user.displayName || "",
        email: fb.user.email || "",
        photo: fb.user.photoURL || "",
      });
      login(data.token, data.user, data.has_profile, data.tokens);
      if (data.is_new_user) {
        trackSignupConversion(data.user?.id);
        trackSignup(data.user?.id, `google_quick_${source}`);
      }
      setDone(typeof data.tokens === "number" ? data.tokens : 200);
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // Their choice — leave the button as it was.
      } else if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment"
        || code === "auth/web-storage-unsupported") {
        navigate("/auth");
      } else {
        toast.error("Couldn't sign you in — please try again.");
      }
    }
    setBusy(false);
  };

  if (done != null) {
    return (
      <div className="rounded-2xl border border-lime-400/30 bg-lime-400/5 p-4 text-left">
        <p className="flex items-center gap-2 font-semibold text-white">
          <Check className="h-4 w-4 text-lime-400" /> You're in — {formatAnalyses(done)} ready
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Next session, film one {what}: side-on, whole body in frame, 10–30 seconds. Then upload it here.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/analyze${sport ? `?sport=${encodeURIComponent(sport)}` : ""}`)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime-400 px-4 py-2 text-sm font-bold text-black hover:bg-lime-500"
        >
          <Camera className="h-4 w-4" /> I have a clip — upload now
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-widest text-zinc-600">
        <span className="h-px flex-1 bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-800" />
      </div>
      <p className="font-semibold text-white">No clip yet?</p>
      <p className="mt-0.5 text-sm text-zinc-400">
        Get your 2 free analyses now and film your next {what} at the gym.
      </p>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="mx-auto mt-3 flex h-12 w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-white text-base font-medium text-black shadow-lg transition-all hover:bg-zinc-100 disabled:opacity-70"
      >
        {busy ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        {busy ? "Signing you in…" : "Continue with Google"}
      </button>
      <p className="mt-2 text-[11px] text-zinc-500">Takes 5 seconds · no card · analyses never expire</p>
    </div>
  );
}
