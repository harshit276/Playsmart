/**
 * MailPanel — pick users from the list, write a message, send it.
 *
 * Dry run first: email cannot be recalled, so the exact recipient list is shown
 * before anything goes out. Opt-outs are filtered server-side too — a manual
 * send must respect an unsubscribe or the link in every footer is a lie.
 */
function MailPanel({ headers }) {
  const [users, setUsers] = useState([]);
  const [picked, setPicked] = useState({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/admin/users", { headers, params: { limit: 500 }, timeout: 20000 });
      setUsers((data.users || []).filter((u) => u.email));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't load users");
    }
    setBusy(false);
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  const shown = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (u.email || "").toLowerCase().includes(s) || (u.name || "").toLowerCase().includes(s);
  });
  const ids = Object.keys(picked).filter((k) => picked[k]);

  const send = async (dry) => {
    if (!ids.length) { toast.error("Pick at least one recipient"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body are required"); return; }
    if (!dry && !window.confirm("Send to " + ids.length + " user(s)? Email cannot be unsent.")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/send-email",
        { user_ids: ids, subject: subject.trim(), body, dry_run: dry },
        { headers, timeout: 120000 });
      setResult(data);
      toast.success(dry ? data.would_send + " would receive it" : "Sent " + data.sent);
      if (!dry) setPicked({});
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    }
    setBusy(false);
  };

  return (
    <div className="bg-zinc-900/60 border border-sky-400/30 rounded-xl p-4 mb-6">
      <p className="text-[11px] uppercase tracking-wider text-sky-400 font-bold mb-3 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Email users
      </p>

      <div className="flex gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or email"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-sky-400 focus:outline-none"
        />
        <Button size="sm" variant="outline" onClick={load} disabled={busy}
          className="border-zinc-700 text-white hover:bg-zinc-800">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-2 text-[11px] text-zinc-400">
        <button type="button" className="underline hover:text-white"
          onClick={() => setPicked(Object.fromEntries(shown.map((u) => [u.id, true])))}>
          Select all shown ({shown.length})
        </button>
        <button type="button" className="underline hover:text-white" onClick={() => setPicked({})}>
          Clear
        </button>
        <span className="ml-auto text-sky-300">{ids.length} selected</span>
      </div>

      <div className="max-h-56 overflow-auto border border-zinc-800 rounded-lg mb-3 bg-zinc-950/60">
        {shown.length === 0 && (
          <p className="text-[12px] text-zinc-500 p-3">{busy ? "Loading…" : "No users with an email."}</p>
        )}
        {shown.map((u) => (
          <label key={u.id}
            className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900 cursor-pointer">
            <input
              type="checkbox"
              checked={!!picked[u.id]}
              onChange={(e) => setPicked((p) => ({ ...p, [u.id]: e.target.checked }))}
            />
            <span className="text-[12px] text-white truncate">{u.email}</span>
            {u.name && <span className="text-[11px] text-zinc-500 truncate">· {u.name}</span>}
          </label>
        ))}
      </div>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-sky-400 focus:outline-none mb-2"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder={"Message. Blank line = new paragraph.\nUse {name} for their first name."}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-sky-400 focus:outline-none mb-2"
      />
      <p className="text-[11px] text-zinc-500 mb-3">
        Sent from {"info@formanti.com"} with the Formanti header and an unsubscribe link.
        Anyone who unsubscribed is skipped automatically.
      </p>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => send(true)} disabled={busy}
          className="border-zinc-700 text-white hover:bg-zinc-800">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Preview recipients"}
        </Button>
        <Button size="sm" onClick={() => send(false)} disabled={busy || !ids.length}
          className="bg-sky-400 text-black hover:bg-sky-500 font-bold">
          Send to {ids.length || "…"}
        </Button>
      </div>

      {result && (
        <div className="mt-3 text-[12px] bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 max-h-40 overflow-auto">
          {result.dry_run ? (
            <>
              <p className="text-zinc-400 mb-1">{result.would_send} recipient(s):</p>
              {(result.recipients || []).map((e, i) => (
                <div key={i} className="font-mono text-[11px] text-zinc-400">{e}</div>
              ))}
            </>
          ) : (
            <p className="text-sky-300">Sent {result.sent} · failed {(result.failed || []).length}</p>
          )}
          {(result.skipped_opted_out || []).length > 0 && (
            <p className="text-amber-400/80 mt-2 text-[11px]">
              Skipped (unsubscribed): {result.skipped_opted_out.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

