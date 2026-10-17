/**
 * Live practice needs an account, gives every account one free trial (10 minutes of camera time, counted by the
 * server) and then asks for a pass. The rules live on the server (backend/practice_access.py); this is the
 * client side of it: ask what the account may do, open a session, send heartbeats, and remember where to send
 * someone back to after they sign in.
 *
 * It is a gate on the UI, not a vault (the pose tracking runs on the phone): see the module doc in practice_access.py.
 */
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/App";

export const fmtClock = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }); } catch { return ""; }
};

// ─── where to go after signing in ───
const AFTER_KEY = "formanti_after_login";
const AFTER_TTL_MS = 30 * 60 * 1000; // long enough to open the verify link in an email on the same device

/** Remember a same-site path (and its query) to return to once the person has signed in. */
export function rememberAfterLogin(path) {
  try {
    if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) localStorage.setItem(AFTER_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch { /* private mode: they land on the dashboard instead */ }
}

/** The remembered path, once (it is cleared as it is read), or null. */
export function takeAfterLogin() {
  try {
    const raw = localStorage.getItem(AFTER_KEY);
    if (!raw) return null;
    localStorage.removeItem(AFTER_KEY);
    const { path, at } = JSON.parse(raw);
    if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && Date.now() - at < AFTER_TTL_MS) return path;
  } catch { /* ignore */ }
  return null;
}

// ─── the server ───
let plansPromise = null;
/** The trial length and the passes on sale, priced for this visitor. */
export function getPracticePlans() {
  if (!plansPromise) plansPromise = api.get("/practice/plans", { timeout: 15000 }).then((r) => r.data).catch((e) => { plansPromise = null; throw e; });
  return plansPromise;
}

export async function getPracticeAccess() {
  const { data } = await api.get("/practice/access", { timeout: 30000 });
  return data;
}

/**
 * Open a session. { ok:true, sessionId, access } or { ok:false, code, access?, status?, error? }.
 * code "trial_over" / "pass_expired" means: show the paywall.
 */
export async function startPracticeSession({ sport, shot }) {
  try {
    const { data } = await api.post("/practice/session/start", { sport: sport || "", shot: shot || "" }, { timeout: 30000 });
    return { ok: true, sessionId: data.session_id, access: data.access };
  } catch (e) {
    const status = e?.response?.status;
    const detail = e?.response?.data?.detail;
    if (status === 402 && detail && detail.access) return { ok: false, code: detail.code || "trial_over", access: detail.access, status };
    return { ok: false, code: "error", status, error: typeof detail === "string" ? detail : e?.message || "Could not start" };
  }
}

/** One heartbeat. Returns the access the server now sees, or null when it could not be reached. */
export async function beatPracticeSession(sessionId, { final = false } = {}) {
  try {
    const { data } = await api.post("/practice/session/beat", { session_id: sessionId, final }, { timeout: 20000 });
    return data?.access || null;
  } catch {
    return null;
  }
}

/** A last beat as the page closes (fetch with keepalive, because a beacon cannot carry the auth header). */
export function beatOnPageHide(sessionId) {
  try {
    const token = localStorage.getItem("playsmart_token");
    if (!token || !sessionId) return;
    fetch(`${api.defaults.baseURL}/practice/session/beat`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: sessionId, final: true }),
    }).catch(() => {});
  } catch { /* nothing to do */ }
}

/** What this account may do right now (null until known, or when signed out). */
export function usePracticeAccess() {
  const { isAuthenticated } = useAuth();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setAccess(null); return null; }
    setLoading(true);
    try {
      const a = await getPracticeAccess();
      setAccess(a); setFailed(false);
      return a;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);
  useEffect(() => { refresh(); }, [refresh]);
  return { access, loading, failed, refresh, setAccess };
}
