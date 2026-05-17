import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import {
  Download, Smartphone, Apple, Share, Plus, Check,
  Zap, Wifi, Bell, Shield, ChevronRight, ArrowRight,
  Chrome, Globe
} from "lucide-react";

function detectPlatform() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

const PERKS = [
  { icon: Zap, title: "Instant launch", desc: "Opens like a real app — no browser bar, no waiting." },
  { icon: Wifi, title: "Works offline", desc: "Browse training plans + saved analyses with no connection." },
  { icon: Bell, title: "Push notifications", desc: "Match invites, friend requests, and training reminders." },
  { icon: Shield, title: "100% safe", desc: "Same secure web app you already trust. No new permissions." },
];

const FAQ = [
  {
    q: "Is this an app from the Play Store / App Store?",
    a: "Not yet — this is a Progressive Web App (PWA). It installs in seconds, takes <5 MB, and works just like a native app. Native Android (Play Store) and iOS (App Store) builds are coming soon."
  },
  {
    q: "Do I lose any features?",
    a: "No. The installed app has everything the website has: AI analysis, training plans, marketplace, wallet — all of it."
  },
  {
    q: "How do updates work?",
    a: "Automatic. When we ship a new version, your app updates in the background the next time you open it. No manual update needed."
  },
  {
    q: "Can I uninstall it?",
    a: "Yes, like any other app — long-press the icon and tap Remove."
  },
];

function AndroidSteps() {
  return (
    <ol className="space-y-3 text-sm text-zinc-300">
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-lime-400/15 text-lime-400 text-xs font-bold flex items-center justify-center">1</span>
        <span>Tap the <span className="font-semibold text-white">"Install AthlyticAI"</span> button above.</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-lime-400/15 text-lime-400 text-xs font-bold flex items-center justify-center">2</span>
        <span>Chrome will show a popup — tap <span className="font-semibold text-white">"Install"</span> to confirm.</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-lime-400/15 text-lime-400 text-xs font-bold flex items-center justify-center">3</span>
        <span>The AthlyticAI icon appears on your home screen. Tap to launch — done!</span>
      </li>
      <li className="flex gap-3 pt-2 text-xs text-zinc-500 border-t border-zinc-800">
        <span className="shrink-0">💡</span>
        <span>If you don't see the install button, open this page in Chrome (not in-app browsers like Instagram).</span>
      </li>
    </ol>
  );
}

function IOSSteps() {
  return (
    <ol className="space-y-3 text-sm text-zinc-300">
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-sky-400/15 text-sky-400 text-xs font-bold flex items-center justify-center">1</span>
        <span>Open this page in <span className="font-semibold text-white">Safari</span> (not Chrome or in-app browsers).</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-sky-400/15 text-sky-400 text-xs font-bold flex items-center justify-center">2</span>
        <span>Tap the <Share className="inline w-3.5 h-3.5 text-sky-400" /> <span className="font-semibold text-white">Share</span> button at the bottom of the screen.</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-sky-400/15 text-sky-400 text-xs font-bold flex items-center justify-center">3</span>
        <span>Scroll and tap <span className="font-semibold text-white">"Add to Home Screen"</span> <Plus className="inline w-3.5 h-3.5" />.</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-sky-400/15 text-sky-400 text-xs font-bold flex items-center justify-center">4</span>
        <span>Tap <span className="font-semibold text-white">"Add"</span>. The icon appears on your home screen.</span>
      </li>
    </ol>
  );
}

function DesktopSteps() {
  return (
    <ol className="space-y-3 text-sm text-zinc-300">
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-purple-400/15 text-purple-400 text-xs font-bold flex items-center justify-center">1</span>
        <span>In Chrome or Edge, look for the <Download className="inline w-3.5 h-3.5" /> install icon in the address bar (right side).</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-purple-400/15 text-purple-400 text-xs font-bold flex items-center justify-center">2</span>
        <span>Click it, then click <span className="font-semibold text-white">"Install"</span> in the popup.</span>
      </li>
      <li className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-purple-400/15 text-purple-400 text-xs font-bold flex items-center justify-center">3</span>
        <span>AthlyticAI opens in its own window and gets pinned to your taskbar / dock.</span>
      </li>
    </ol>
  );
}

export default function DownloadPage() {
  const [platform, setPlatform] = useState("unknown");
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [androidApk, setAndroidApk] = useState(null); // { latest_version, apk_url, release_notes } | null

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const installed = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);

    // Check if a hosted APK is available
    fetch("/data/app-version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.android?.apk_url && data?.android?.latest_version) {
          setAndroidApk(data.android);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  const platformLabel = platform === "ios" ? "iPhone / iPad"
    : platform === "android" ? "Android"
    : platform === "desktop" ? "Desktop" : "your device";

  return (
    <div className="min-h-screen bg-background text-white">
      <SEO
        title="Get the AthlyticAI App — Install on Android, iPhone & Desktop"
        description="Install AthlyticAI on your phone in seconds. Works on Android, iPhone, and Desktop. No app store needed. AI sports coaching at your fingertips."
        url="https://athlyticai.com/download"
      />

      {/* Hero */}
      <section className="relative pt-12 sm:pt-20 pb-12 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-lime-400/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/20 text-lime-400 text-xs font-medium mb-6">
            <Download className="w-3 h-3" /> Free • No app store needed
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
            Get the AthlyticAI app on <span className="text-lime-400">{platformLabel}</span>
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-xl mx-auto mb-8">
            Install in 10 seconds. Works offline. Same app as the website — faster, with a home-screen icon.
          </p>

          {installed ? (
            <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-lime-400/10 border border-lime-400/30 text-lime-400 font-medium">
              <Check className="w-5 h-5" /> Already installed — you're using the app now!
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
              {platform === "android" && deferredPrompt && (
                <Button
                  onClick={handleInstall}
                  disabled={installing}
                  size="lg"
                  className="bg-lime-400 hover:bg-lime-500 text-black font-semibold text-base h-12 px-6"
                >
                  {installing ? "Installing..." : <><Download className="w-5 h-5 mr-2" /> Install AthlyticAI</>}
                </Button>
              )}
              {platform === "android" && !deferredPrompt && (
                <a
                  href="#android-steps"
                  className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-lime-400 hover:bg-lime-500 text-black font-semibold"
                >
                  <Smartphone className="w-5 h-5" /> See Install Steps
                </a>
              )}
              {platform === "ios" && (
                <a
                  href="#ios-steps"
                  className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-sky-400 hover:bg-sky-500 text-black font-semibold"
                >
                  <Apple className="w-5 h-5" /> See iPhone Install Steps
                </a>
              )}
              {platform === "desktop" && (
                <a
                  href="#desktop-steps"
                  className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-purple-400 hover:bg-purple-500 text-black font-semibold"
                >
                  <Chrome className="w-5 h-5" /> See Desktop Install Steps
                </a>
              )}
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white"
              >
                <Globe className="w-4 h-4" /> Use in Browser
              </Link>
            </div>
          )}

          <p className="text-xs text-zinc-600 mt-6">
            ~ 5 MB • No ads • Free forever
          </p>
        </div>
      </section>

      {/* Perks */}
      <section className="py-10 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {PERKS.map((p) => (
            <div
              key={p.title}
              className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800"
            >
              <div className="w-9 h-9 rounded-lg bg-lime-400/10 text-lime-400 flex items-center justify-center mb-3">
                <p.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">{p.title}</p>
              <p className="text-xs text-zinc-500 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform-specific steps */}
      <section className="py-10 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            id="android-steps"
            className={`p-6 rounded-2xl border ${platform === "android" ? "bg-lime-400/5 border-lime-400/30" : "bg-zinc-900/50 border-zinc-800"}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-lime-400/10 text-lime-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold">Android</h3>
            </div>
            {androidApk && (
              <a
                href={androidApk.apk_url}
                download
                className="mb-4 flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-lime-400 hover:bg-lime-500 text-black font-semibold text-sm"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download APK v{androidApk.latest_version}
                </span>
                <ChevronRight className="w-4 h-4" />
              </a>
            )}
            <AndroidSteps />
          </div>

          <div
            id="ios-steps"
            className={`p-6 rounded-2xl border ${platform === "ios" ? "bg-sky-400/5 border-sky-400/30" : "bg-zinc-900/50 border-zinc-800"}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-400/10 text-sky-400 flex items-center justify-center">
                <Apple className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold">iPhone / iPad</h3>
            </div>
            <IOSSteps />
          </div>

          <div
            id="desktop-steps"
            className={`p-6 rounded-2xl border ${platform === "desktop" ? "bg-purple-400/5 border-purple-400/30" : "bg-zinc-900/50 border-zinc-800"}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-400/10 text-purple-400 flex items-center justify-center">
                <Chrome className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold">Desktop</h3>
            </div>
            <DesktopSteps />
          </div>
        </div>
      </section>

      {/* Coming Soon strip */}
      <section className="py-8 px-4">
        <div className="max-w-3xl mx-auto p-5 rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800">
          <div className="flex items-start gap-4">
            <div className="text-2xl">🚀</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Native Android & iOS apps coming soon</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                We're packaging AthlyticAI for the Play Store and App Store. Install the web app today — you'll get a one-tap upgrade prompt the day they ship.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Common questions</h2>
          <p className="text-sm text-zinc-500 text-center mb-8">Everything you need to know about installing the app.</p>
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <details
                key={i}
                className="group p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                  <span className="text-sm font-medium text-white">{item.q}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-12 px-4 pb-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to play smarter?</h2>
          <p className="text-zinc-400 mb-6 text-sm sm:text-base">
            Install the app and get 300 free tokens — enough for 3 video analyses.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-lime-400 hover:bg-lime-500 text-black font-semibold"
            >
              Sign Up Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white"
            >
              Explore First
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
