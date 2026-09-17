import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/App";
import api from "@/lib/api";
import { track } from "@/lib/analytics";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

/**
 * PhonePrompt — asks a signed-in user, once, for an optional phone number.
 *
 * WHY: feedback requests go out by email and early users mostly ignore
 * email; a WhatsApp message gets read. Optional, one tap to skip, and a skip
 * is remembered (server + this device) so it never nags.
 *
 * WHEN: a few seconds after any sign-in (Google, email, the "No clip yet?"
 * button) or on the next visit for existing users — but never on the auth,
 * admin or legal pages, and never while an analysis is uploading or running,
 * where a dialog would get in the way.
 *
 * Opening it on demand: dispatch `formanti:ask-phone` (the Profile page
 * does this for "Add phone number").
 */
const DONE_KEY = (uid) => `phone_prompt_done:${uid}`;
const QUIET_PATHS = [/^\/auth/, /^\/admin/, /^\/(privacy|terms|refund|cancellation|shipping)/];

export default function PhonePrompt() {
  const { user, refreshProfile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [whatsappOk, setWhatsappOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uid = user?.id;

  // Manual open (Profile page), even after a skip.
  useEffect(() => {
    const onAsk = () => { setError(""); setOpen(true); };
    window.addEventListener("formanti:ask-phone", onAsk);
    return () => window.removeEventListener("formanti:ask-phone", onAsk);
  }, []);

  // Automatic, once.
  useEffect(() => {
    if (!uid || user?.phone || user?.demo_account) return undefined;
    if (QUIET_PATHS.some((re) => re.test(location.pathname))) return undefined;
    try { if (localStorage.getItem(DONE_KEY(uid))) return undefined; } catch { /* ask anyway */ }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || window.__analysisInFlight) return;
      // The user object from a fresh login is thin; ask the server whether
      // this account already has a number or skipped before.
      try {
        const { data } = await api.get("/auth/me", { timeout: 6000 });
        const u = data?.user || {};
        if (u.phone || u.phone_prompt_skipped_at || u.demo_account) {
          try { localStorage.setItem(DONE_KEY(uid), "1"); } catch { /* noop */ }
          return;
        }
      } catch {
        return; // can't check — don't risk asking someone who already answered
      }
      if (cancelled || window.__analysisInFlight) return;
      setOpen(true);
      track("phone_prompt_shown");
    }, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [uid, user?.phone, user?.demo_account, location.pathname]);

  const finish = () => {
    try { if (uid) localStorage.setItem(DONE_KEY(uid), "1"); } catch { /* noop */ }
    setOpen(false);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    if (!phone.trim()) { setError("Enter your mobile number, or tap Skip."); return; }
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/phone", { phone, whatsapp_ok: whatsappOk }, { timeout: 12000 });
      track("phone_added", { whatsapp_ok: whatsappOk }); // never the number itself
      toast.success("Thanks — number saved.");
      finish();
      refreshProfile?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Couldn't save your number — please try again.");
    }
    setBusy(false);
  };

  const skip = () => {
    track("phone_skipped");
    api.post("/auth/phone", { skip: true }, { timeout: 8000 }).catch(() => {});
    finish();
  };

  if (!uid) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) skip(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" /> Add your phone number
            <span className="text-xs font-normal text-zinc-500">(optional)</span>
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            We'll message you on WhatsApp to ask how your analysis went and to help if
            something looks off. No spam, and we never share your number.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-3 mt-1">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); }}
            placeholder="+91 98765 43210"
            aria-label="Mobile number"
            className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-700 px-4 text-base text-white placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={whatsappOk}
              onChange={(e) => setWhatsappOk(e.target.checked)}
              className="h-4 w-4 accent-lime-400"
            />
            OK to message me on WhatsApp
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 h-11 rounded-xl bg-lime-400 font-bold text-black hover:bg-lime-500 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={skip}
              className="h-11 rounded-xl px-5 text-zinc-400 hover:text-white"
            >
              Skip
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
