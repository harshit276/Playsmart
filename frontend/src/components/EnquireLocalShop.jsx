/**
 * EnquireLocalShop — modal that lets a user request a callback from a
 * local sports store with the best price + availability for a given
 * product. Submits to /api/equipment/enquiry.
 *
 * Usage:
 *   <EnquireLocalShop productName="Yonex Astrox 99 Pro" sport="badminton">
 *     <Button>Enquire Local Shop</Button>
 *   </EnquireLocalShop>
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MapPin, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export default function EnquireLocalShop({ productName, sport, children }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", city: "", notes: "" });

  const close = () => {
    setOpen(false);
    // reset form on next open
    setTimeout(() => { setSubmitted(false); setForm({ name: "", phone: "", city: "", notes: "" }); }, 250);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Name and phone number are required");
      return;
    }
    if (!/^\+?\d[\d\s-]{7,15}$/.test(form.phone.trim())) {
      toast.error("Enter a valid phone number");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/equipment/enquiry", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || null,
        product: productName,
        sport: sport || null,
        notes: form.notes.trim() || null,
      });
      setSubmitted(true);
    } catch (err) {
      toast.error("Couldn't submit. Try again or call directly.");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        {!submitted ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-lime-400" /> Enquire Local Shop
              </DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                Get a callback in <span className="text-lime-400 font-medium">1–2 hours</span> with
                the best local price & availability for <span className="text-white font-medium">{productName}</span>.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-3 mt-2">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Your Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Phone Number *</label>
                <input
                  type="tel"
                  required
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">City <span className="text-zinc-600">(optional)</span></label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Bangalore, Mumbai…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Notes <span className="text-zinc-600">(optional)</span></label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Preferred time to call, alternate model, etc."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-lime-400 focus:outline-none resize-none"
                />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={close}
                  className="text-zinc-400 hover:text-white">Cancel</Button>
                <Button type="submit" disabled={submitting}
                  className="bg-lime-400 text-black hover:bg-lime-500 font-bold">
                  {submitting ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Submitting…</> : <>Request Callback</>}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="w-14 h-14 rounded-full bg-lime-400/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-lime-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Request Submitted</h3>
            <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
              You'll get a callback within <span className="text-lime-400 font-medium">1–2 hours</span> with
              the best local price and availability for <span className="text-white">{productName}</span>.
            </p>
            <div className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-4 inline-flex items-center gap-2 text-xs text-zinc-300">
              <Phone className="w-3 h-3 text-lime-400" /> We'll call <span className="font-mono">{form.phone}</span>
            </div>
            <div>
              <Button onClick={close} className="bg-lime-400 text-black hover:bg-lime-500 font-bold rounded-full px-6">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
