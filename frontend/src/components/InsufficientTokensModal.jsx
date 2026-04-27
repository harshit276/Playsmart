/**
 * InsufficientTokensModal — opened when the analyze flow gets a 402 from
 * the server (or when client pre-check sees balance < required). Two
 * paths: Buy more (opens BuyTokensDialog) and Earn free (links out to
 * /referral or /community).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, ShoppingCart, UserPlus, Users, Dumbbell, Lock } from "lucide-react";
import BuyTokensDialog from "@/components/BuyTokensDialog";

export default function InsufficientTokensModal({ open, onOpenChange, balance = 0, required = 100 }) {
  const navigate = useNavigate();
  const [buyOpen, setBuyOpen] = useState(false);

  const close = () => onOpenChange(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-purple-400" /> Need a few more tokens
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              This analysis costs <span className="text-white font-medium">{required} tokens</span>.
              You have <span className="text-white font-medium">{balance}</span> right now —
              earn <span className="text-lime-400 font-medium">{required - balance} more</span> for free, or top up.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            <button
              onClick={() => { close(); setBuyOpen(true); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-lime-400/10 border border-lime-400/30 hover:bg-lime-400/20 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-lime-400 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-4 h-4 text-black" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Buy tokens</p>
                <p className="text-[11px] text-zinc-400">From ₹99 · UPI / cards / netbanking</p>
              </div>
            </button>

            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold pt-2 pb-1">Or earn free tokens</p>

            <EarnRow
              icon={UserPlus} title="Refer a friend" detail="+200 each side · unlimited"
              onClick={() => { close(); navigate("/referral"); }}
            />
            <EarnRow
              icon={Users} title="Host a community game" detail="+50 per game · 5/day"
              onClick={() => { close(); navigate("/community?host=1"); }}
            />
            <EarnRow
              icon={Dumbbell} title="Complete a training day" detail="+20 per day"
              onClick={() => { close(); navigate("/training"); }}
            />
          </div>

          <Button variant="ghost" onClick={close} className="text-zinc-400 hover:text-white mt-2">
            Maybe later
          </Button>
        </DialogContent>
      </Dialog>

      <BuyTokensDialog open={buyOpen} onOpenChange={setBuyOpen} />
    </>
  );
}

function EarnRow({ icon: Icon, title, detail, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-zinc-700/60 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-lime-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white">{title}</p>
        <p className="text-[10px] text-zinc-500">{detail}</p>
      </div>
    </button>
  );
}
