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
import { Video, ShoppingCart, UserPlus, Users, Dumbbell } from "lucide-react";
import BuyTokensDialog from "@/components/BuyTokensDialog";
import { TOKENS_PER_ANALYSIS, describeAnalysisAmount } from "@/lib/analyses";

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
              <Video className="w-5 h-5 text-purple-400" /> You're out of analyses
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {required > TOKENS_PER_ANALYSIS ? (
                <>This analysis uses <span className="text-white font-medium">{describeAnalysisAmount(required)}</span>. </>
              ) : null}
              You have <span className="text-white font-medium">{describeAnalysisAmount(balance)}</span> left.
              Get more free by inviting a friend, or top up.
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
                <p className="text-sm font-bold text-white">Buy analyses</p>
                {/* No hardcoded price: packs are priced by country, so the
                    dialog this opens shows the right currency. */}
                <p className="text-[11px] text-zinc-400">One-time packs · no subscription · never expire</p>
              </div>
            </button>

            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold pt-2 pb-1">Or earn free analyses</p>

            <EarnRow
              icon={UserPlus} title="Invite a friend" detail="+2 analyses for each of you · unlimited"
              onClick={() => { close(); navigate("/referral"); }}
            />
            <EarnRow
              icon={Users} title="Host a community game" detail="+½ analysis per game · 5/day"
              onClick={() => { close(); navigate("/community?host=1"); }}
            />
            <EarnRow
              icon={Dumbbell} title="Complete a training day" detail="Adds up to 1 free analysis"
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
