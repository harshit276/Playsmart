/**
 * @module liftDraw
 * Canvas drawing for the lift check: the lifter's skeleton, the green corrected
 * pose where something is out of range, and a small angle read-out. Shared by
 * the still pictures and the moving player so they always look the same.
 * Only needs a 2D context, no DOM.
 */
import { GHOST_EDGES } from "./correctPose.js";

const GREEN = "#a3e635";
const DARK = "rgba(10,10,10,0.85)";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{px:number[][], vis:number[], ang?:object, ghost?:{px2:number[][], moved:boolean[], w:number}|null}} f  one frame
 * @param {number} s   scale from the frame's pixel space to the canvas
 * @param {{lw?:number, readout?:boolean}} [o]
 */
export function drawLiftFrame(ctx, f, s, o = {}) {
  const lw = o.lw || Math.max(2, ctx.canvas.width / 170);
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // the real skeleton
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  for (const [a, b] of GHOST_EDGES) {
    if (f.vis[a] < 0.3 || f.vis[b] < 0.3) continue;
    ctx.beginPath(); ctx.moveTo(f.px[a][0] * s, f.px[a][1] * s); ctx.lineTo(f.px[b][0] * s, f.px[b][1] * s); ctx.stroke();
  }

  // the corrected pose, only the parts that moved
  const g = f.ghost;
  if (g && g.w > 0.02) {
    ctx.globalAlpha = Math.min(1, 0.3 + 0.7 * g.w);
    for (const [color, width] of [[DARK, lw * 3.6], [GREEN, lw * 2.4]]) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const [a, b] of GHOST_EDGES) {
        if (!g.moved[a] && !g.moved[b]) continue;
        if (f.vis[a] < 0.3 || f.vis[b] < 0.3) continue;
        ctx.beginPath(); ctx.moveTo(g.px2[a][0] * s, g.px2[a][1] * s); ctx.lineTo(g.px2[b][0] * s, g.px2[b][1] * s); ctx.stroke();
      }
    }
    ctx.fillStyle = "#fff";
    for (const i of [11, 12, 23, 24, 25, 26]) {
      if (!g.moved[i] || f.vis[i] < 0.3) continue;
      ctx.beginPath(); ctx.arc(g.px2[i][0] * s, g.px2[i][1] * s, lw * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (o.readout && f.ang) {
    const parts = [["Hip", f.ang.hip], ["Knee", f.ang.knee], ["Back", f.ang.trunk]].filter(([, v]) => v != null);
    if (parts.length) {
      // Back is lean from vertical: negative means leaning back past upright
      const text = parts.map(([n, v]) => `${n} ${Math.round(Math.abs(v))}°${n === "Back" && v < -3 ? " back" : ""}`).join("   ");
      const fs = Math.max(12, Math.round(ctx.canvas.width / 28));
      ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const w = ctx.measureText(text).width + fs, h = fs * 1.6;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(fs * 0.5, fs * 0.5, w, h);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, fs, fs * 0.5 + h / 2);
    }
  }
  ctx.restore();
}
