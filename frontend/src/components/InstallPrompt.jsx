import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share } from "lucide-react";

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) {
      setIsInstalled(true);
      return;
    }

    const dismissedAt = localStorage.getItem('pwa_install_dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

    // iOS doesn't support beforeinstallprompt — show manual instructions
    if (isIOS()) {
      // Delay showing iOS prompt by 3 seconds so user sees the app first
      const timer = setTimeout(() => setShowIOSPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android/Desktop: use the standard install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  };

  if (isInstalled || dismissed) return null;

  // iOS: Show manual install instructions
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-2xl shadow-black/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-lime-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Install AthlyticAI</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Tap <Share className="w-3 h-3 inline text-blue-400 mx-0.5" /> Share in Safari, then
                <span className="text-white font-medium"> "Add to Home Screen"</span>
              </p>
              <Button size="sm" variant="ghost" onClick={handleDismiss}
                className="h-6 text-[10px] text-zinc-500 hover:text-zinc-300 px-0 mt-2">
                Dismiss
              </Button>
            </div>
            <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android/Desktop: Standard install prompt
  if (!deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime-400/10 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-lime-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Install AthlyticAI</p>
            <p className="text-xs text-zinc-400 mt-0.5">Add to home screen for a native app experience</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall}
                className="h-7 text-xs bg-lime-400 text-black hover:bg-lime-500 font-medium px-3">
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss}
                className="h-7 text-xs text-zinc-400 hover:text-zinc-300 px-2">
                Not now
              </Button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
