/**
 * BulkGrantPanel — hand tokens to a pasted list of accounts.
 *
 * Dry run first, always. Bulk credits are not reversible in any way the
 * recipient won't notice, and a mistyped amount or a stray address is
 * expensive, so we resolve the list and show what each balance WOULD become
 * before anything moves.
 */
function BulkGrantPanel({ headers }) {
  const [ids, setIds] = useState("");
  const [amount, setAmount] = useState("200");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const run = async (dry) => {
    const amt = parseInt(amount, 10);
    if (!ids.trim()) { toast.error("Paste some emails first"); return; }
    if (!Number.isFinite(amt) || amt === 0) { toast.error("Enter a non-zero amount"); return; }
    if (!dry && !window.confirm(
      "Credit " + amt + " tokens to " + (preview?.found ?? "?") + " account(s)? This cannot be undone.")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/grant-tokens-bulk",
        { identifiers: ids, amount: amt, reason: reason.trim(), dry_run: dry, notify },
        { headers, timeout: 120000 });
      setPreview(data);
      if (dry) toast.success(data.found + " found · " + data.not_found.length + " not found");
      else { toast.success("Credited " + data.credited + " account(s)"); setIds(""); }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk grant failed");
    }
    setBusy(false);
  };

  return (
    <div className="bg-zinc-900/60 border border-amber-400/30 rounded-xl p-4 mb-6">
      <p className="text-[11px] uppercase tracking-wider text-amber-400 font-bold mb-3 flex items-center gap-1.5">
        <Coins className="w-3.5 h-3.5" /> Bulk grant tokens
      </p>
      <textarea
        value={ids}
        onChange={(e) => setIds(e.target.value)}
        placeholder="Paste emails (or phones / user ids) — commas, spaces or new lines all work"
        rows={4}
        disabled={busy}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none mb-2 font-mono"
      />
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 mb-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))}
          placeholder="Amount"
          inputMode="numeric"
          disabled={busy}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none font-mono"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (stored on every transaction)"
          disabled={busy}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
        />
      </div>
      <label className="flex items-center gap-2 text-[12px] text-zinc-400 mb-3">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={busy} />
        Email each person that tokens were added
      </label>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}
          className="border-zinc-700 text-white hover:bg-zinc-800">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Preview (no changes)"}
        </Button>
        <Button size="sm" onClick={() => run(false)} disabled={busy || !preview || !preview.found}
          className="bg-amber-400 text-black hover:bg-amber-500 font-bold">
          Credit {preview?.found ? preview.found + " account(s)" : "…"}
        </Button>
      </div>
      {preview && (
        <div className="mt-3 text-[12px] text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 max-h-52 overflow-auto">
          <p className="text-zinc-400 mb-1">
            {preview.dry_run ? "Preview" : "Done"} · found {preview.found ?? preview.credited}
            {preview.not_found?.length ? " · not found " + preview.not_found.length : ""}
          </p>
          {(preview.preview || preview.accounts || []).slice(0, 40).map((r, i) => (
            <div key={i} className="font-mono text-[11px] text-zinc-400">
              {r.email} {r.before != null ? r.before + " → " + r.after : "→ " + r.balance}
            </div>
          ))}
          {preview.not_found?.length > 0 && (
            <p className="text-amber-400/80 mt-2 text-[11px]">
              Not found: {preview.not_found.slice(0, 20).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FeedbackCampaignPanel — the one-off "tell us what was wrong" email.
 *
 * Dry run first: bulk mail cannot be recalled, and a careless send damages the
 * sending domain that payment and verification email depend on.
 */
function FeedbackCampaignPanel({ headers }) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);

  const run = async (dry) => {
    if (!dry && !window.confirm(
      "Send the feedback email to " + (data?.would_send ?? "?") + " user(s)? This cannot be unsent.")) return;
    setBusy(true);
    try {
      const { data: res } = await api.post("/admin/feedback-campaign",
        { dry_run: dry, limit: 200 }, { headers, timeout: 120000 });
      setData(res);
      toast.success(dry ? res.would_send + " would receive it" : "Sent " + res.sent);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Campaign failed");
    }
    setBusy(false);
  };

  return (
    <div className="bg-zinc-900/60 border border-lime-400/30 rounded-xl p-4 mb-6">
      <p className="text-[11px] uppercase tracking-wider text-lime-400 font-bold mb-2 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Feedback campaign
      </p>
      <p className="text-[12px] text-zinc-400 mb-3">
        One email per user, ever, asking what the analysis got wrong — and offering
        bonus tokens for answering, paid the same for criticism as for praise.
        Skips anyone who unsubscribed or already received it.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}
          className="border-zinc-700 text-white hover:bg-zinc-800">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Preview recipients"}
        </Button>
        <Button size="sm" onClick={() => run(false)} disabled={busy || !data?.would_send}
          className="bg-lime-400 text-black hover:bg-lime-500 font-bold">
          Send to {data?.would_send ?? "…"}
        </Button>
      </div>
      {data && (
        <div className="mt-3 text-[12px] text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 max-h-52 overflow-auto">
          {data.dry_run ? (
            <>
              <p className="text-zinc-400 mb-1">{data.would_send} recipient(s):</p>
              {(data.recipients || []).map((e, i) => (
                <div key={i} className="font-mono text-[11px] text-zinc-400">{e}</div>
              ))}
            </>
          ) : (
            <p className="text-lime-300">Sent {data.sent} · failed {data.failed}</p>
          )}
        </div>
      )}
    </div>
  );
}

