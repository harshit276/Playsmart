import { useCallback, useEffect, useRef, useState } from "react";
import { beatPracticeSession, beatOnPageHide, startPracticeSession } from "@/lib/practiceAccess";

const BEAT_EVERY_MS = 15000;

/**
 * Counts the free trial down while the camera is live, and tells the session when it has run out.
 *
 * `session` is what PracticePage got from /practice/session/start: { id, access }. While `running` and the access
 * reason is "trial", a clock ticks every second and a heartbeat goes to the server every 15 s; the server's count is
 * the truth (it caps what a heartbeat can add), the local clock only keeps the countdown smooth and ends the session
 * even if the network drops. Under a pass (or for staff) nothing is counted and nothing is sent.
 *
 * @returns {{ left:number|null, onTrial:boolean, restart:()=>Promise<{ok:boolean, code?:string}> }}
 *   left: seconds of trial left (null when not on the trial); restart: open a fresh session ("Practise again").
 */
export function usePracticeMeter({ session, running, sport, shot, onExpire }) {
  const [state, setState] = useState(() => ({ id: session?.id || null, access: session?.access || null, left: session?.access?.reason === "trial" ? session.access.trial_seconds_left : null }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const expiredRef = useRef(false);

  const onTrial = state.access?.reason === "trial";

  useEffect(() => {
    if (!running || !onTrial || !state.id) return undefined;
    let last = performance.now();
    let sinceBeat = 0;
    let inFlight = false;
    const expire = () => { if (!expiredRef.current) { expiredRef.current = true; expireRef.current?.(); } };
    const tick = setInterval(async () => {
      const now = performance.now();
      const dt = Math.min(5000, now - last); // a throttled background tab must not burn the countdown in one jump
      last = now;
      sinceBeat += dt;
      setState((s) => (s.left == null ? s : { ...s, left: Math.max(0, s.left - dt / 1000) }));
      if (stateRef.current.left != null && stateRef.current.left - dt / 1000 <= 0) { expire(); return; }
      if (sinceBeat >= BEAT_EVERY_MS && !inFlight) {
        sinceBeat = 0; inFlight = true;
        const acc = await beatPracticeSession(stateRef.current.id);
        inFlight = false;
        if (acc) {
          setState((s) => ({ ...s, access: acc, left: acc.reason === "trial" ? acc.trial_seconds_left : s.left }));
          if (!acc.allowed) expire();
        }
      }
    }, 1000);
    const hide = () => beatOnPageHide(stateRef.current.id);
    window.addEventListener("pagehide", hide);
    return () => { clearInterval(tick); window.removeEventListener("pagehide", hide); beatPracticeSession(stateRef.current.id, { final: true }); };
  }, [running, onTrial, state.id]);

  const restart = useCallback(async () => {
    const r = await startPracticeSession({ sport, shot });
    if (r.ok) {
      expiredRef.current = false;
      setState({ id: r.sessionId, access: r.access, left: r.access.reason === "trial" ? r.access.trial_seconds_left : null });
    }
    return r;
  }, [sport, shot]);

  return { left: state.left, onTrial, access: state.access, restart };
}
