import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if previously dismissed
    const dismissedAt = localStorage.getItem('pwa_install_dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

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

  if (isInstalled || dismissed || !deferredPrompt) return null;

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
