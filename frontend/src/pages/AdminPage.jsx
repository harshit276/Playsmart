/**
 * AdminPage — internal-only dashboard. Auth is a single shared key
 * stored in localStorage; key is sent as X-Admin-Key on every request.
 *
 * Tabs:
 *   • Stats — top counts + revenue + token economy summary
 *   • Users — last N users
 *   • Enquiries — local-shop callback requests, with status update
 *   • Transactions — token credits/debits
 *   • Payments — Cashfree orders
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Users, MessageSquare, Coins, CreditCard,
  RefreshCw, Loader2, Lock, LogOut, ExternalLink, Phone,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const ADMIN_KEY_STORAGE = "athlytic_admin_key";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [adminKey, setAdminKey] = useState(() => {
    try { return localStorage.getItem(ADMIN_KEY_STORAGE) || ""; } catch { return ""; }
  });
  const [keyInput, setKeyInput] = useState("");
  const [authed, setAuthed] = useState(!!adminKey);
  const [tab, setTab] = useState("stats");

  useEffect(() => { document.title = "Admin · AthlyticAI"; }, []);

  const headers = useMemo(() => ({ "X-Admin-Key": adminKey }), [adminKey]);

  const tryLogin = async () => {
    if (!keyInput.trim()) return;
    // Verify by hitting /admin/stats — if 403, wrong key.
    try {
      await api.get("/admin/stats", { headers: { "X-Admin-Key": keyInput.trim() }, timeout: 8000 });
      try { localStorage.setItem(ADMIN_KEY_STORAGE, keyInput.trim()); } catch {}
      setAdminKey(keyInput.trim());
      setAuthed(true);
      toast.success("Admin key accepted");
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 403 ? "Wrong admin key" : `Error: ${err.message || "Couldn't verify"}`);
    }
  };

  const logout = () => {
    try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch {}
    setAdminKey("");
    setAuthed(false);
    setKeyInput("");
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full text-center">
          <Lock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-1">Admin Sign-In</h2>
          <p className="text-zinc-500 text-xs mb-4">
            Paste your <code className="text-zinc-300">ADMIN_WIPE_KEY</code> (set on Vercel).
          </p>
          <input
            type="password"
            placeholder="admin key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryLogin()}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none mb-3"
          />
          <Button onClick={tryLogin} className="w-full bg-amber-400 text-black hover:bg-amber-500 font-bold rounded-full">
            Unlock
          </Button>
          <button onClick={() => navigate("/")} className="text-xs text-zinc-500 hover:text-zinc-300 mt-3">
            ← Back to site
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-6 sm:py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-white uppercase tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-amber-400" /> Admin Dashboard
          </h1>
          <Button onClick={logout} size="sm" variant="ghost"
            className="text-zinc-500 hover:text-red-400 text-xs">
            <LogOut className="w-3 h-3 mr-1" /> Logout
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-zinc-800 border-zinc-700 mb-6 w-full grid grid-cols-3 sm:grid-cols-6 max-w-2xl">
            <TabsTrigger value="stats" className="text-xs data-[state=active]:bg-amber-400 data-[state=active]:text-black">Stats</TabsTrigger>
            <TabsTrigger value="users" className="text-xs data-[state=active]:bg-amber-400 data-[state=active]:text-black">Users</TabsTrigger>
            <TabsTrigger value="enquiries" className="text-xs data-[state=active]:bg-amber-400 data-[state=active]:text-black">Enquiries</TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs data-[state=active]:bg-amber-400 data-[state=active]:text-black">Tokens</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs data-[state=active]:bg-amber-400 data-[state=active]:text-black">Payments</TabsTrigger>
            <TabsTrigger value="support" className="text-xs data-[state=active]:bg-amber-400 data-[state=active]:text-black">Support</TabsTrigger>
          </TabsList>

          <TabsContent value="stats"><StatsTab headers={headers} /></TabsContent>
          <TabsContent value="users"><UsersTab headers={headers} /></TabsContent>
          <TabsContent value="enquiries"><EnquiriesTab headers={headers} /></TabsContent>
          <TabsContent value="transactions"><TransactionsTab headers={headers} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab headers={headers} /></TabsContent>
          <TabsContent value="support"><SupportTab headers={headers} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Stats tab ───────────────────────────────────────────────
function StatsTab({ headers }) {
  const { data, loading, refresh } = useFetch("/admin/stats", headers);
  const [testing, setTesting] = useState(false);
  const [pingingCF, setPingingCF] = useState(false);
  const [cfResult, setCfResult] = useState(null);
  const sendTestNotification = async () => {
    setTesting(true);
    try {
      const r = await api.post("/admin/test-notify", {}, { headers, timeout: 10000 });
      const channels = Object.entries(r.data?.channels || {})
        .filter(([, on]) => on).map(([k]) => k);
      if (!channels.length) toast.error("No channels configured. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars.");
      else toast.success(`Test sent to: ${channels.join(", ")}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test failed");
    }
    setTesting(false);
  };
  const pingCashfree = async () => {
    setPingingCF(true);
    setCfResult(null);
    try {
      const r = await api.get("/admin/cashfree-ping", { headers, timeout: 12000 });
      setCfResult(r.data);
      if (r.data?.ok) toast.success(`Cashfree ${r.data.env}: keys OK`);
      else toast.error(`Cashfree: ${r.data?.error || "auth failed"}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Cashfree ping failed");
    }
    setPingingCF(false);
  };
  const [fixing, setFixing] = useState(false);
  const fixPhoneIndex = async () => {
    if (!confirm("Drop + recreate the users.phone index as partial-unique?\n(One-shot fix. Safe.)")) return;
    setFixing(true);
    try {
      const r = await api.post("/admin/fix-phone-index", {}, { headers, timeout: 15000 });
      const ok = r.data?.write_probe_after_fix === "ok";
      if (ok) toast.success("Phone index fixed! Writes work now.");
      else toast.error("Fix ran but writes still failing — check details");
      setCfResult({ ok, env: "INDEX FIX", configured: true, response: r.data });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Fix failed");
    }
    setFixing(false);
  };
  if (loading) return <Spinner />;
  if (!data) return null;
  const tiles = [
    { label: "Users", val: data.counts?.users },
    { label: "Profiles", val: data.counts?.player_profiles },
    { label: "Analyses", val: data.counts?.video_analyses },
    { label: "Games", val: data.counts?.games },
    { label: "Enquiries", val: data.counts?.enquiries },
    { label: "Token Txns", val: data.counts?.token_transactions },
    { label: "Payments", val: data.counts?.payment_orders },
    { label: "Referrals", val: data.counts?.referrals },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Counts</p>
        <div className="flex gap-2">
          <Button onClick={sendTestNotification} disabled={testing} size="sm" variant="outline"
            className="border-amber-400/30 text-amber-300 hover:bg-amber-400/10 text-xs h-7">
            {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : "🔔"} Test notify
          </Button>
          <Button onClick={pingCashfree} disabled={pingingCF} size="sm" variant="outline"
            className="border-lime-400/30 text-lime-300 hover:bg-lime-400/10 text-xs h-7">
            {pingingCF ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : "💳"} Ping Cashfree
          </Button>
          <Button onClick={fixPhoneIndex} disabled={fixing} size="sm" variant="outline"
            className="border-rose-400/30 text-rose-300 hover:bg-rose-400/10 text-xs h-7">
            {fixing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : "🔧"} Fix phone index
          </Button>
          <Button onClick={refresh} size="sm" variant="ghost" className="text-zinc-400 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>
      {cfResult && (
        <div className={`rounded-xl border p-3 text-xs ${
          cfResult.ok ? "bg-lime-400/5 border-lime-400/30 text-lime-200" : "bg-rose-400/5 border-rose-400/30 text-rose-200"
        }`}>
          <p className="font-semibold mb-1">
            {cfResult.ok ? "✅" : "❌"} Cashfree {cfResult.env} {cfResult.configured ? `· ${cfResult.app_id_prefix || ""}` : "(not configured)"}
            {cfResult.demo_mode ? " · demo mode ON" : ""}
          </p>
          <pre className="text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(cfResult.response || cfResult.error || {}, null, 2).slice(0, 400)}
          </pre>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{t.label}</p>
            <p className="font-heading font-black text-2xl text-white mt-1">
              {t.val == null || t.val === -1 ? "—" : t.val.toLocaleString("en-IN")}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        <div className="bg-gradient-to-br from-purple-500/10 to-zinc-900 border border-purple-400/30 rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold mb-2">Token Economy</p>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="text-[10px] text-zinc-500">Credited</p><p className="text-xl font-bold text-lime-400">{data.tokens?.credited?.toLocaleString("en-IN")}</p></div>
            <div><p className="text-[10px] text-zinc-500">Spent</p><p className="text-xl font-bold text-amber-400">{data.tokens?.spent?.toLocaleString("en-IN")}</p></div>
            <div><p className="text-[10px] text-zinc-500">Outstanding</p><p className="text-xl font-bold text-purple-300">{data.tokens?.outstanding?.toLocaleString("en-IN")}</p></div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-lime-500/10 to-zinc-900 border border-lime-400/30 rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-lime-300 font-bold mb-2">Revenue (INR)</p>
          <p className="font-heading font-black text-3xl text-white">₹{(data.revenue_inr || 0).toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-zinc-500 mt-1">From token pack purchases</p>
        </div>
      </div>
    </div>
  );
}

// ── Users tab ───────────────────────────────────────────────
function UsersTab({ headers }) {
  const { data, loading, refresh } = useFetch("/admin/users?limit=200", headers);
  if (loading) return <Spinner />;
  const rows = data?.users || [];
  return (
    <div>
      <Header title={`${rows.length} users`} onRefresh={refresh} />
      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-zinc-300 text-sm font-medium mb-1">No users yet</p>
          <p className="text-zinc-500 text-xs">
            Sign up via the main site to see records here. Or check{" "}
            <a href="/api/health" target="_blank" rel="noreferrer" className="text-amber-400 underline">
              /api/health
            </a>{" "}
            to confirm Mongo is reachable.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(u => (
            <div key={u.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-full bg-lime-400/15 flex items-center justify-center font-bold text-lime-400 text-lg shrink-0">
                {(u.name || u.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{u.name || "—"}</p>
                <p className="text-xs text-zinc-400 truncate font-mono">{u.email || u.phone || "—"}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] text-zinc-500 font-mono">id: {(u.id || "").slice(0, 12)}…</span>
                  <span className="text-[10px] text-zinc-500">· {fmtDate(u.created_at)}</span>
                  {u.demo_account && <Badge className="bg-purple-400/15 text-purple-300 border-purple-400/30 text-[9px]">demo</Badge>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-bold text-purple-300">🪙 {(u.tokens ?? 0).toLocaleString("en-IN")}</p>
                <p className="text-[10px] text-zinc-500">tokens</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Enquiries tab ──────────────────────────────────────────
function EnquiriesTab({ headers }) {
  const { data, loading, refresh } = useFetch("/admin/enquiries?limit=200", headers);
  if (loading) return <Spinner />;
  const rows = data?.enquiries || [];

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/admin/enquiries/${id}`, { status }, { headers });
      toast.success("Updated");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  return (
    <div>
      <Header title={`${rows.length} enquiries`} onRefresh={refresh} />
      {rows.length === 0 ? <p className="text-zinc-500 text-sm py-8 text-center">No enquiries yet.</p> : (
        <div className="space-y-3">
          {rows.map(e => (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-white">{e.name}</p>
                    <a href={`https://wa.me/${(e.phone || "").replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 rounded-full px-2 py-0.5 font-mono">
                      <Phone className="w-2.5 h-2.5" /> {e.phone}
                    </a>
                    <Badge className={`text-[10px] ${
                      e.status === "closed" ? "bg-zinc-800 text-zinc-500" :
                      e.status === "contacted" ? "bg-sky-400/15 text-sky-300 border-sky-400/30" :
                      "bg-amber-400/15 text-amber-300 border-amber-400/30"
                    }`}>{e.status || "pending"}</Badge>
                  </div>
                  <p className="text-xs text-zinc-300">
                    <span className="text-white font-medium">{e.product}</span>
                    {e.sport && <span className="text-zinc-500"> · {e.sport}</span>}
                    {e.city && <span className="text-zinc-500"> · {e.city}</span>}
                  </p>
                  {e.notes && <p className="text-[11px] text-zinc-500 italic mt-1">"{e.notes}"</p>}
                  <p className="text-[10px] text-zinc-600 mt-1">{fmtDate(e.created_at)}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {e.status !== "contacted" && (
                    <button onClick={() => updateStatus(e.id, "contacted")}
                      className="text-[10px] bg-sky-400/15 hover:bg-sky-400/25 text-sky-300 border border-sky-400/30 rounded-full px-3 py-1">
                      Mark contacted
                    </button>
                  )}
                  {e.status !== "closed" && (
                    <button onClick={() => updateStatus(e.id, "closed")}
                      className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-full px-3 py-1">
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transactions tab ───────────────────────────────────────
function TransactionsTab({ headers }) {
  const { data, loading, refresh } = useFetch("/admin/transactions?limit=200", headers);
  if (loading) return <Spinner />;
  const rows = data?.transactions || [];
  return (
    <div>
      <Header title={`${rows.length} transactions`} onRefresh={refresh} />
      <Table cols={["Kind", "Δ", "Balance after", "User", "When"]}>
        {rows.map(t => (
          <tr key={t.id} className="border-b border-zinc-800">
            <td className="py-2 px-3 text-zinc-300 text-xs">{t.kind}</td>
            <td className={`py-2 px-3 font-mono text-right font-bold ${t.delta > 0 ? "text-lime-400" : "text-amber-400"}`}>{t.delta > 0 ? "+" : ""}{t.delta}</td>
            <td className="py-2 px-3 font-mono text-right text-purple-300">{t.balance_after ?? "—"}</td>
            <td className="py-2 px-3 text-zinc-500 text-[10px] font-mono">{(t.user_id || "").slice(0, 12)}…</td>
            <td className="py-2 px-3 text-zinc-500 text-xs">{fmtDate(t.created_at)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ── Payments tab ───────────────────────────────────────────
function PaymentsTab({ headers }) {
  const { data, loading, refresh } = useFetch("/admin/payments?limit=200", headers);
  if (loading) return <Spinner />;
  const rows = data?.payments || [];
  return (
    <div>
      <Header title={`${rows.length} payment orders`} onRefresh={refresh} />
      <Table cols={["Order ID", "Pack", "Amount", "Status", "User", "When"]}>
        {rows.map(p => (
          <tr key={p.cashfree_order_id} className="border-b border-zinc-800">
            <td className="py-2 px-3 text-zinc-400 text-[10px] font-mono">{p.cashfree_order_id?.slice(0, 24)}…</td>
            <td className="py-2 px-3 text-zinc-300 text-xs">{p.pack_key} · {p.tokens_amount} 🪙</td>
            <td className="py-2 px-3 text-purple-300 font-mono text-right">₹{p.amount_inr}</td>
            <td className="py-2 px-3">
              <Badge className={`text-[10px] ${
                p.status === "paid" ? "bg-lime-400/15 text-lime-300 border-lime-400/30" :
                p.status === "failed" ? "bg-red-400/15 text-red-300 border-red-400/30" :
                "bg-amber-400/15 text-amber-300 border-amber-400/30"
              }`}>{p.status}</Badge>
            </td>
            <td className="py-2 px-3 text-zinc-500 text-[10px] font-mono">{(p.user_id || "").slice(0, 12)}…</td>
            <td className="py-2 px-3 text-zinc-500 text-xs">{fmtDate(p.created_at)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ── Support tickets tab ───────────────────────────────────
function SupportTab({ headers }) {
  const { data, loading, refresh } = useFetch("/admin/support-tickets?limit=200", headers);
  if (loading) return <Spinner />;
  const rows = data?.tickets || [];
  return (
    <div>
      <Header title={`${rows.length} tickets`} onRefresh={refresh} />
      {rows.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">No support tickets yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(t => (
            <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-bold text-white">{t.subject}</p>
                    <Badge className="bg-zinc-800 text-zinc-400 text-[10px]">{t.category || "other"}</Badge>
                  </div>
                  <p className="text-xs text-zinc-300">
                    {t.name} · <a href={`mailto:${t.email}`} className="text-amber-300 underline">{t.email}</a>
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{fmtDate(t.created_at)}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-800/40 rounded-lg p-3 mt-2">
                {t.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────
function useFetch(url, headers) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(url, { headers, timeout: 15000 });
      setData(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Fetch failed: ${url}`);
    }
    setLoading(false);
  }, [url, headers]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

function Header({ title, onRefresh }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{title}</p>
      <Button onClick={onRefresh} size="sm" variant="ghost" className="text-zinc-400 text-xs">
        <RefreshCw className="w-3 h-3 mr-1" /> Refresh
      </Button>
    </div>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center py-12 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>;
}

function Table({ cols, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-800/50">
          <tr>
            {cols.map(c => <th key={c} className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-bold py-2 px-3">{c}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
