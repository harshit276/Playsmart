import { useEffect, useState } from "react";
import LiftFix from "@/components/LiftFix";
import { LIFTS } from "@/ai/liftPose";

/**
 * Test-only page: the lift form check on a same-site clip, without logging in or running an
 * analysis. Only routed in builds made with REACT_APP_DEV_ROUTES set (see App.js); the
 * production build leaves it out.
 *
 * /dev/lift?clip=/some/clip.mp4[&strict=1]
 * strict=1 narrows the deadlift ranges so a clean clip still shows faults and the green fix.
 */
export default function DevLiftPage() {
  const q = new URLSearchParams(window.location.search);
  const clip = q.get("clip");
  if (q.get("strict")) {
    LIFTS.deadlift.lockout.knee = { min: 172, max: 185, ideal: 178, why: "knees locked at the top" };
    LIFTS.deadlift.setup.trunk = { min: 35, max: 60, ideal: 48, why: "chest up over the bar" };
    LIFTS.deadlift.setup.knee = { min: 125, max: 150, ideal: 135, why: "enough knee bend" };
  }
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (!clip || !clip.startsWith("/") || clip.startsWith("//")) return undefined;
    let alive = true;
    fetch(clip).then((r) => r.blob()).then((b) => { if (alive) setFile(b); }).catch(() => {});
    return () => { alive = false; };
  }, [clip]);
  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white p-4 max-w-md mx-auto">
      <LiftFix videoFile={file} lift="deadlift" />
    </div>
  );
}
