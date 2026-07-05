# Getting any video compressed + uploaded in < 45 s — and keeping it Gemini-readable

Research for Atheonics' Analyze flow. Goal: any clip (incl. > 50 MB) goes from "click Analyze" to "in Gemini's hands" in under 45 seconds, with output Gemini can actually decode and a low token bill.

---

## 1. The budget: it's two clocks, not one

End-to-end time = **compress time + upload time**. They trade against each other:

- **Upload the original (today's path):** zero compress time, but a 50–130 MB file over a typical 5–10 Mbps phone uplink = **60–180 s**. This is why > 50 MB feels slow.
- **Downscale first, then upload:** spend ~10–20 s compressing, but the upload shrinks 5–10× (a 17 s 1080p clip → ~2–5 MB at 720p) → upload drops to a few seconds. **Net: far under 45 s.**

So the winning move is **downscale before upload** — *if* the compressor is fast and the output is Gemini-decodable. Both conditions failed in the codebase's earlier attempt; this doc is about fixing that.

A key fact that removes a worry: **Gemini does not bill by upload resolution.** It samples at 1 fps and tokenizes each frame at a fixed rate (258 tokens/frame default, 66 at low media-resolution). So downscaling 1080p→720p before upload is **free** on the Gemini bill — the bill is driven by *duration* and `media_resolution`, not the file you send. (Source: Gemini video-understanding docs.)

---

## 2. What makes a video "seeable" by Gemini

Gemini's Files API accepts standard containers/codecs: `video/mp4`, `mov`, `webm`, `mpeg`, `avi`, `wmv`, `flv`, `3gpp`. H.264 ("avc") in an MP4 is the safest, most universally decodable choice.

"Gemini can't see it / no shots detected" almost always means the **container is structurally off**, not that the codec is unsupported. The usual culprits, in order:

1. **`moov` atom placement (Fast Start).** If the metadata box (`moov`) sits at the *end* of the file, a server that reads progressively can fail to parse it. Fast Start = `moov` at the front. *(Note: Mediabunny's `BufferTarget` already defaults `fastStart` to `'in-memory'`, i.e. front-loaded — so this was probably NOT the codebase's bug, but it must stay explicit.)*
2. **Codec-config mismatch** (the `avcC` box / bitstream format). A muxer that writes the H.264 bitstream in the wrong framing produces a file that looks valid but decodes to nothing.
3. **Broken timestamps / timescale** → the clip reports ~0 s duration, so 1 fps sampling yields no frames.
4. **Too-low bitrate for fast motion** → the shuttle/contact frames blur out; Gemini sees motion but can't classify shots. (The codebase already learned "480p was too blurry → no picker.")

**The decisive insight:** the earlier WebCodecs attempt was reverted because *every* ≥ 25 MB clip came back "no shots." That uniformity points to a structural output problem — and it shipped **with no verification step**. The fix is not just a better encoder config; it's **verifying the transcoded file is decodable before trusting it**, with automatic fallback to the original when it isn't.

---

## 3. How fast tools actually do this

**Compression — the "WhatsApp trick":** native apps use the phone's hardware H.264 encoder (VideoToolbox / MediaCodec). The browser's bridge to that same hardware is **WebCodecs** (`VideoEncoder`/`VideoDecoder`), supported on Chrome/Edge/Android and iOS Safari 16.4+. Wrapped by **Mediabunny** (demux → hardware-decode → downscale → hardware-encode → mux), a 1–2 min 1080p clip transcodes to 720p in **~10–20 s**, vs **~60–120 s** for `ffmpeg.wasm` (software, single-thread). This is exactly the lib already vendored in the repo (`webcodecsTranscode.js`, currently disabled). `mp4-muxer`/`webm-muxer` are now superseded by Mediabunny, so it's the right, current choice.

**Upload — the "Loom/Descript trick":** split the file into 5–10 MB parts and upload **4–6 in parallel** via presigned URLs straight to object storage. Benchmarks: 6-way parallel multipart ≈ **38–40 % faster**; with transfer acceleration ≈ **60 % faster** than a single stream. It also recovers from a dropped chunk by retrying only that chunk, not the whole file. (Source: AWS multipart-upload benchmarks.)

Note: the **direct browser→Gemini** resumable upload is **CORS-blocked** (we proved this live — `Direct upload network error (possibly CORS)`). Google's upload URL doesn't allow a cross-origin browser PUT, so uploads must go to our storage (Cloudinary today) and the backend hands Gemini the file. That's fine — once the file is small, even the multi-hop path is quick.

---

## 4. Recommended architecture

**Primary path — downscale-then-upload, with a verify gate:**

1. **Transcode on-device with WebCodecs/Mediabunny** to 720p H.264, audio dropped, `fastStart: 'in-memory'` set *explicitly*. Use a quality high enough for fast motion (favor sharper contact frames over smaller size — `QUALITY_HIGH` for sports, not `QUALITY_MEDIUM`). ~10–20 s.
2. **Verify the output is decodable** before using it — this is the step that was missing:
   - Re-open the produced file with Mediabunny, confirm: a video track exists, `duration > ~0.5 s`, width/height match the target, and at least a few frames actually decode (pull 2–3 `VideoSample`s).
   - If any check fails → discard the transcode, fall back to uploading the **original** (today's known-good behavior). No regression possible.
3. **Upload the small result** (~2–10 MB). At that size it's a few seconds on any path; chunked/parallel upload is a nice-to-have, not required once the file is small.
4. **Trigger only when it pays off:** run the transcode for clips that are large *or* high-res (e.g. `size > 20 MB` OR longer side `> 1280`). Small/already-720p clips upload as-is.

**Fallback ladder (each step is the current behavior, so worst case = today):**
WebCodecs transcode + verify → (fail) → upload original via Cloudinary (with the timeout/retry/cancel already shipped) → (fail) → ffmpeg.wasm path.

**Why this hits < 45 s:** the only variable cost is the ~10–20 s transcode; the upload becomes trivial. Even a 130 MB 4K phone clip → ~8 MB 720p → uploads in seconds.

---

## 5. Keeping the Gemini bill low (separate lever)

Upload path doesn't affect the bill; these do:

- **`media_resolution = low`** → 66 tokens/frame instead of 258 (~**74 % cheaper** per frame). For shot detection on framed-up players this is usually fine; keep default/medium only if reading fine detail (distant shuttle, scoreboard) matters. Already env-tunable: `GEMINI_MEDIA_RESOLUTION`.
- **`fps`** is currently **4.0** (4× the 1 fps default) to catch fast contact moments → 4× the frame tokens. That's a deliberate accuracy choice; lowering it cuts cost but risks missing the smash contact. Tune per sport rather than globally.
- **Duration** is the biggest multiplier — clipping to the relevant 5–15 s (the app already recommends this) is the cleanest saving.

---

## 6. Concrete next steps for this codebase

1. **Re-enable `webcodecsTranscode.js` with three changes:** explicit `fastStart: 'in-memory'`, `QUALITY_HIGH` (sports), and a **decode-verify** before returning the file (the missing safety net).
2. **Wire it into `compressIfNeeded` / the upload flow** for clips `> ~20 MB` or `> 1280px`, ahead of the Cloudinary upload, with the existing graceful fallback.
3. **Add one log line** of the before/after size + transcode time so we can confirm the < 45 s target on real devices.
4. **(Optional) parallel-chunk the Cloudinary upload** for the residual large-original fallback cases.
5. **Set `GEMINI_MEDIA_RESOLUTION=low`** (env) and measure shot-detection accuracy — likely a large bill cut at no quality loss for this use case.

The single most important change vs. last time: **verify the transcode is decodable and fall back when it isn't.** That turns "we tried WebCodecs and Gemini went blind" into a safe, reversible optimization.

---

## Sources

- [Video understanding — Gemini API](https://ai.google.dev/gemini-api/docs/video-understanding) (formats, 1 fps sampling, 258 vs 66 tokens/frame, media_resolution)
- [Supported input files & requirements — Firebase AI Logic](https://firebase.google.com/docs/ai-logic/input-file-requirements)
- [Mediabunny — Output formats](https://mediabunny.dev/guide/output-formats) (`fastStart` options; BufferTarget defaults to `'in-memory'`)
- [Mediabunny — Supported formats & codecs](https://mediabunny.dev/guide/supported-formats-and-codecs) (AVC/H.264 in MP4; encodability checks)
- [WebCodecs Fundamentals — Transcoding](https://webcodecsfundamentals.org/patterns/transcoding/) and [Muxing](https://webcodecsfundamentals.org/basics/muxing/)
- [Optimizing video uploads with WebCodecs (Medium, S. Wadhwa)](https://medium.com/@sahilwadhwa.5454/optimizing-video-uploads-client-side-using-webcodecs-and-the-mediarecorder-api-87586aa77e52)
- [Uploading large objects to S3 — multipart + transfer acceleration (AWS)](https://aws.amazon.com/blogs/compute/uploading-large-objects-to-amazon-s3-using-multipart-upload-and-transfer-acceleration/) (parallel-chunk benchmarks)
