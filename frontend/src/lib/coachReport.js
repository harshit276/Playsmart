/**
 * coachReport — generates a print-ready Coach Report from an analysis
 * result and opens the browser's print dialog (users "Save as PDF").
 *
 * Why client-side print instead of a PDF library or server rendering:
 *   - zero new dependencies, zero server cost, works offline
 *   - works identically for live results AND saved history records
 *     (both share the same result object shape)
 *   - browsers' print-to-PDF output is high quality and A4-paginated
 *
 * The report is a coach-readable, implementable artifact: session
 * verdict, per-shot table with timestamps, what's working / what to fix,
 * measured posture + movement numbers, and a concrete next-session plan.
 */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtTime = (s) => {
  if (typeof s !== "number" || !Number.isFinite(s)) return "—";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const cap = (s) => esc(String(s || "").replace(/_/g, " ")).replace(/\b\w/g, (c) => c.toUpperCase());

// Best-effort grab of an on-page canvas/img (court map, posture skeleton)
// as a data URL so the report includes the visuals the user saw.
function grabImage(selector) {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    if (el.tagName === "CANVAS") return el.toDataURL("image/png");
    if (el.tagName === "IMG" && el.src?.startsWith("data:")) return el.src;
  } catch { /* visual is optional */ }
  return null;
}

export function openCoachReport(result, opts = {}) {
  if (!result) return false;
  const playerName = opts.playerName || "Player";
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const cn = result.coach_narrative || {};
  const shots = Array.isArray(result.shots) ? result.shots : [];
  const mv = result.movement || {};
  const win = result._analyzed_window || null;

  // Top implementable fixes: distinct per-shot tips, most frequent first.
  const tipCounts = new Map();
  for (const s of shots) {
    const tip = (s.formFeedback?.tip || "").trim();
    if (tip) tipCounts.set(tip, (tipCounts.get(tip) || 0) + 1);
  }
  const topFixes = [...tipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

  const courtImg = grabImage("canvas[title*='Tap a dot']");
  const postureImg = grabImage("img[alt*='posture at contact' i]");

  const shotRows = shots.slice(0, 30).map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${fmtTime(s.timestamp)}</td>
      <td><b>${esc(s.shot_label || s.name || s.type || "Shot")}</b></td>
      <td>${cap(s.intent || "—")}</td>
      <td>${cap(s.outcome === "continued_rally" ? "rally" : (s.outcome || "—"))}</td>
      <td>${s.score != null ? esc(s.score) : "—"}</td>
      <td class="small">${esc(s.quality_observation || s.formFeedback?.tip || s.reasoning || "")}</td>
    </tr>`).join("");

  const bullets = (arr) => (arr || []).map((p) => `<li>${esc(p)}</li>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Formanti Coach Report — ${esc(result.sport || "")} — ${esc(date)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #18181b; padding: 28px 34px; font-size: 12px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #84cc16; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 1px; } .brand span { color: #65a30d; }
  .meta { text-align: right; color: #52525b; font-size: 11px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px; color: #3f6212; margin: 16px 0 6px; border-left: 4px solid #84cc16; padding-left: 8px; }
  .grid { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
  .stat { border: 1px solid #d4d4d8; border-radius: 8px; padding: 8px 12px; min-width: 110px; }
  .stat .k { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #71717a; }
  .stat .v { font-size: 16px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; border-bottom: 1.5px solid #a1a1aa; padding: 4px 6px; }
  td { border-bottom: 1px solid #e4e4e7; padding: 5px 6px; vertical-align: top; }
  .small { font-size: 10.5px; color: #3f3f46; }
  ul { padding-left: 18px; } li { margin: 3px 0; }
  .box { border: 1.5px solid #84cc16; background: #f7fee7; border-radius: 8px; padding: 10px 12px; margin-top: 6px; }
  .fix { background: #fffbeb; border-color: #f59e0b; }
  .note { color: #52525b; font-size: 10.5px; font-style: italic; }
  .imgs { display: flex; gap: 14px; align-items: flex-start; }
  .imgs img { max-height: 180px; border: 1px solid #d4d4d8; border-radius: 6px; }
  .footer { margin-top: 22px; border-top: 1px solid #d4d4d8; padding-top: 8px; display: flex; justify-content: space-between; color: #71717a; font-size: 10px; }
  @media print { body { padding: 10mm 12mm; } .noprint { display: none; } }
</style></head><body>
  <div class="head">
    <div class="brand">⚡ ATHE<span>ONICS</span> <span style="font-weight:500;color:#52525b;font-size:13px">· Coach Report</span></div>
    <div class="meta"><b>${esc(playerName)}</b> · ${esc(cap(result.sport || "Sport"))} · ${esc(date)}<br>
      Skill level: <b>${esc(result.skill_level || "—")}</b>${result.shot_analysis?.score != null ? ` · Session score: <b>${esc(result.shot_analysis.score)}/100</b>` : ""}</div>
  </div>

  ${win ? `<p class="note">Coverage: the most active ${Math.round(win.length)}s (${fmtTime(win.start)}–${fmtTime(win.start + win.length)}) of a ${fmtTime(win.total)} video was analyzed.</p>` : ""}
  ${result.player_legend?.you ? `<p class="note">Target player: ${esc(result.player_legend.you)}${result.player_legend.partner ? ` · Partner: ${esc(result.player_legend.partner)}` : ""}</p>` : ""}

  <h2>Session Verdict</h2>
  <p>${esc(cn.intro || result.quick_summary || "")}</p>

  <div class="grid">
    <div class="stat"><div class="k">Shots analyzed</div><div class="v">${shots.length}</div></div>
    <div class="stat"><div class="k">Shot types</div><div class="v">${new Set(shots.map((s) => s.type).filter(Boolean)).size}</div></div>
    ${typeof mv.distance_covered_m === "number" ? `<div class="stat"><div class="k">Distance covered</div><div class="v">${mv.distance_covered_m < 10 ? mv.distance_covered_m.toFixed(1) : Math.round(mv.distance_covered_m)} m</div></div>` : ""}
    ${typeof mv.court_coverage_pct === "number" ? `<div class="stat"><div class="k">Court coverage</div><div class="v">${Math.round(mv.court_coverage_pct)}%</div></div>` : ""}
    ${mv.avg_recovery_quality ? `<div class="stat"><div class="k">Recovery to base</div><div class="v">${cap(mv.avg_recovery_quality)}</div></div>` : ""}
  </div>

  ${cn.progress_update ? `<h2>Since Last Session</h2><div class="box">${esc(cn.progress_update)}</div>` : ""}

  <h2>What's Working</h2>
  <ul>${bullets(cn.strengths_points)}</ul>

  <h2>Priority Fixes — Work These In Order</h2>
  <div class="box fix"><ol style="padding-left:18px">${
    (topFixes.length ? topFixes : cn.improvements_points || []).map((t) => `<li><b>${esc(t)}</b></li>`).join("")
  }</ol></div>
  ${cn.improvements_points?.length ? `<ul>${bullets(cn.improvements_points)}</ul>` : ""}

  ${(courtImg || postureImg) ? `<h2>Positioning & Posture</h2><div class="imgs">
    ${courtImg ? `<img src="${courtImg}" alt="Court positioning map">` : ""}
    ${postureImg ? `<img src="${postureImg}" alt="Posture at contact">` : ""}
  </div>${mv.note ? `<p class="note" style="margin-top:4px">${esc(mv.note)}</p>` : ""}` : ""}

  <h2>Shot-by-Shot Breakdown</h2>
  <table><thead><tr><th>#</th><th>Time</th><th>Shot</th><th>Intent</th><th>Outcome</th><th>Score</th><th>Coach note</th></tr></thead>
  <tbody>${shotRows}</tbody></table>

  ${cn.takeaway ? `<h2>Next Session Focus</h2><div class="box">${esc(cn.takeaway)}</div>` : ""}

  <div class="footer">
    <div>Generated by Formanti AI Coach · formanti.com</div>
    <div>Re-analyze in 7 days to measure progress on the priority fixes.</div>
  </div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return false; // popup blocked — caller shows a toast
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
