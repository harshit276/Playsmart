import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Camera, Mail } from "lucide-react";
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
 * @param {string} source   where it is shown ("gym", "home", …) — analytics only.
 * @param {string} [sport]  sport slug: picks the wording and the upload page.
 * @param {"center"|"start-lg"} [align]  "start-lg" left-aligns from lg up
 *                          (for left-aligned heroes like the home page).
 */

// What to film, and where, per sport — "film your next rally on court".
const FILM_COPY = {
  gym: { what: "set", where: "at the gym" },
  weight_lifting: { what: "lift", where: "at the gym" },
  physiotherapy: { what: "exercise", where: "at home" },
  badminton: { what: "rally", where: "on court" },
  tennis: { what: "rally", where: "on court" },
  table_tennis: { what: "rally", where: "at the table" },
  pickleball: { what: "rally", where: "on court" },
  cricket: { what: "over", where: "at the nets" },
  football: { what: "drill", where: "on the pitch" },
  basketball: { what: "shot", where: "on court" },
  swimming: { what: "length", where: "in the pool" },
};
function filmCopy(sport) {
  const c = FILM_COPY[sport];
  if (!c) {
    // Home page / unknown sport: not tied to one activity.
    return {
      offer: "film your next game or workout",
      next: "Next time you play or train, film 10–30 seconds",
    };
  }
  return {
    offer: `film your next ${c.what} ${c.where}`,
    next: `Next time you're ${c.where}, film one ${c.what}`,
  };
}

// In-app browsers (YouTube, Instagram, Facebook… opening an ad) are Android
// WebViews / embedded Safari that Google blocks for sign-in
// ("disallowed_useragent" — shown inside the popup, so we never get an error
// code to react to). There, email is the only path that works, so lead with it.
function isInAppBrowser() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return /; wv\)|\bFBAN|\bFBAV|Instagram|Line\/|YouTube|Snapchat|Twitter/i.test(ua);
}

const GoogleG = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const INPUT = "h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-base text-white placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none";

export default function QuickSignupCTA({ source, sport, align = "center" }) {
  const copy = filmCopy(sport);
  const startLg = align === "start-lg";
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [inApp] = useState(isInAppBrowser);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);      // tokens after Google signup
  const [phone, setPhone] = useState("");      // optional, asked right here
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");    // email-link sent
  const [error, setError] = useState("");
  const emailOpen = showEmail || inApp;

  // Signed-in visitors already have the upload box right above this.
  if (isAuthenticated && !done) return null;

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    track("quick_signup_clicked", { source, method: "google", in_app: inApp, with_phone: !!phone.trim() });
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
      // The number typed above the button — saved now that there's an account.
      if (phone.trim()) {
        api.post("/auth/phone", { phone, whatsapp_ok: true }, {
          timeout: 12000, headers: { Authorization: `Bearer ${data.token}` },
        }).then(() => track("phone_added", { whatsapp_ok: true, at: "signup" }))
          .catch((e) => toast.error(e?.response?.data?.detail || "Couldn't save your number — you can add it from your profile."));
      }
      setDone(typeof data.tokens === "number" ? data.tokens : 200);
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // Their choice — leave the button as it was.
      } else if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment"
        || code === "auth/web-storage-unsupported") {
        setShowEmail(true);
        setError("Google sign-in isn't available in this browser — use your email instead.");
      } else {
        toast.error("Couldn't sign you in — please try again.");
      }
    }
    setBusy(false);
  };

  const sendLink = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    const addr = email.trim();
    if (!addr) { setError("Enter your email to get your link."); return; }
    setBusy(true);
    setError("");
    track("quick_signup_clicked", { source, method: "email", in_app: inApp, with_phone: !!phone.trim() });
    try {
      await api.post("/auth/email-link", { email: addr, phone, source }, { timeout: 15000 });
      track("email_link_sent", { source, in_app: inApp });
      setSentTo(addr);
    } catch (err) {
      setError(err?.response?.data?.detail || "Couldn't send your link — please try again.");
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
          {copy.next} — side-on, whole body in frame. Then upload it here.
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

  if (sentTo) {
    return (
      <div className="rounded-2xl border border-lime-400/30 bg-lime-400/5 p-4 text-left">
        <p className="flex items-center gap-2 font-semibold text-white">
          <Mail className="h-4 w-4 text-lime-400" /> Check your inbox
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          We sent a link to <span className="text-white">{sentTo}</span>. Tap it to get your 2 free
          analyses — it works on any device. Not there? Check spam or Promotions.
        </p>
        <button type="button" onClick={() => { setSentTo(""); setShowEmail(true); }}
          className="mt-2 text-xs text-lime-400 underline underline-offset-2">
          Use a different email
        </button>
      </div>
    );
  }

  const mx = startLg ? "mx-auto lg:mx-0" : "mx-auto";
  return (
    <div className={startLg ? "text-center lg:text-left" : "text-center"}>
      <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-widest text-zinc-600">
        <span className="h-px flex-1 bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-800" />
      </div>
      <p className="font-semibold text-white">No clip yet?</p>
      <p className="mt-0.5 text-sm text-zinc-400">
        Get your 2 free analyses now and {copy.offer}.
      </p>

      <div className={`${mx} mt-3 w-full max-w-xs space-y-2`}>
        {/* Optional, asked at the same step: lets us follow up on WhatsApp. */}
        <input
          type="tel" inputMode="tel" autoComplete="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError(""); }}
          placeholder="Mobile (optional, for WhatsApp tips)"
          aria-label="Mobile number (optional)"
          className={INPUT}
        />

        {!inApp && (
          <button
            type="button"
            onClick={signIn}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white text-base font-medium text-black shadow-lg transition-all hover:bg-zinc-100 disabled:opacity-70"
          >
            {busy && !emailOpen ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            ) : <GoogleG />}
            {busy && !emailOpen ? "Signing you in…" : "Continue with Google"}
          </button>
        )}

        {emailOpen ? (
          <form onSubmit={sendLink} className="space-y-2">
            <input
              type="email" inputMode="email" autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="Your email"
              aria-label="Email"
              className={INPUT}
            />
            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-400 text-base font-bold text-black hover:bg-lime-500 disabled:opacity-70"
            >
              <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowEmail(true)}
            className="w-full text-sm text-zinc-400 underline underline-offset-4 decoration-zinc-600 hover:text-white">
            Continue with email instead
          </button>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">No password · no card · analyses never expire</p>
    </div>
  );
}
