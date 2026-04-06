import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn, Zap } from "lucide-react";

export default function LoginPromptModal({ open, onClose, message }) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center">
              <Zap className="w-7 h-7 text-lime-400" />
            </div>
          </div>
          <DialogTitle className="text-center text-white text-xl font-heading font-bold uppercase tracking-tight">
            Sign in to Continue
          </DialogTitle>
          <DialogDescription className="text-center text-zinc-400 text-sm">
            {message || "Create a free account to save your progress, track improvements, and unlock all features."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            onClick={() => {
              onClose(false);
              localStorage.removeItem("guest_mode");
              navigate("/auth");
            }}
            className="w-full bg-lime-400 text-black hover:bg-lime-500 font-bold uppercase tracking-wide h-12 rounded-full shadow-[0_0_15px_rgba(190,242,100,0.2)]"
          >
            <LogIn className="w-4 h-4 mr-2" /> Sign In / Sign Up
          </Button>
          <Button
            variant="ghost"
            onClick={() => onClose(false)}
            className="w-full text-zinc-500 hover:text-zinc-300"
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
