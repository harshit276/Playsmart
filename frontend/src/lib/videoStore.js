/**
 * videoStore — IndexedDB persistence for the user's most-recent
 * uploaded video file.
 *
 * Why this exists:
 *   localStorage persists the analysis result (text JSON), but a Blob
 *   isn't serializable into localStorage. Without somewhere to keep the
 *   actual video bytes, the slow-mo player in FormComparisonModal can
 *   only work in the same tab session that performed the upload — a
 *   refresh wipes the file and the YOU panel goes blank with a
 *   "re-upload to enable slow-motion replay" hint.
 *
 *   This store keeps a SINGLE most-recent video in IndexedDB with a
 *   short TTL so the slow-mo player keeps working across refreshes,
 *   without committing us to long-term server-side video storage.
 *
 * Scope (approach D from the form-comparison plan):
 *   • Single slot, key = "current" — most-recent upload wins.
 *   • Default TTL 1h — past that, the entry is purged on next load.
 *   • Reconstitutes saved Blobs as File objects on load, so callers
 *     can treat them identically to a fresh `<input type="file">`
 *     selection (name, lastModified, type all preserved).
 *   • All ops are best-effort — IndexedDB unavailable / quota exceeded
 *     resolves without throwing; the caller falls back to the
 *     historical-mode "re-upload" hint.
 *
 * Non-goals:
 *   • Multi-video history. Single slot only — keeps storage bounded
 *     and avoids us having to decide retention policy in the UI.
 *   • Cross-device sync. Use server-side storage for that (option B
 *     in the plan; not built yet).
 *   • Encryption. Video sits in the browser's profile storage like any
 *     other web app data — same trust model as localStorage.
 */

const DB_NAME = "playsmart_videos";
const DB_VERSION = 1;
const STORE = "blobs";
const KEY = "current";

// ─── Internal: open the DB, creating the object store on first run ───
function _openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
    req.onblocked = () => reject(new Error("indexedDB blocked by other tab"));
  });
}

/**
 * Save the current video. Overwrites any previous slot.
 *
 * @param {File|Blob} blob — the uploaded video.
 * @param {number} [ttlMs=3600000] — how long the entry is valid.
 * @returns {Promise<boolean>} true on success, false on any failure.
 */
export async function saveVideo(blob, ttlMs = 60 * 60 * 1000, key = KEY) {
  if (!blob || (typeof blob.size === "number" && blob.size === 0)) return false;
  try {
    const db = await _openDb();
    const entry = {
      // Wrap the Blob so we can still read it back as a File.
      blob,
      name: blob.name || "video.mp4",
      type: blob.type || "video/mp4",
      lastModified: blob.lastModified || Date.now(),
      size: blob.size,
      savedAt: Date.now(),
      expiresAt: Date.now() + Math.max(1000, ttlMs),
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idb put failed"));
      tx.onabort = () => reject(tx.error || new Error("idb tx aborted"));
    });
    return true;
  } catch (e) {
    // Quota exceeded, private mode, etc. — surface in console once but
    // never throw; callers proceed without persistence.
    console.warn("[videoStore] save failed:", e?.message || e);
    return false;
  }
}

/**
 * Load the current video, if any and not expired.
 *
 * @returns {Promise<{ file: File, savedAt: number, expiresAt: number } | null>}
 *   The cached file (reconstituted as a File object so existing code
 *   that reads .name / .lastModified works unchanged), plus timestamps
 *   so the UI can show "expires in N min". Null when nothing is cached,
 *   the entry expired, or IndexedDB is unavailable.
 */
export async function loadVideo(key = KEY) {
  try {
    const db = await _openDb();
    const entry = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("idb get failed"));
    });
    if (!entry) return null;
    if (typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt) {
      // Lazy purge so an expired entry doesn't keep eating quota.
      purgeVideo(key).catch(() => {});
      return null;
    }
    if (!entry.blob) return null;
    // Reconstitute as File so consumers can read blob.name and treat it
    // like a freshly-selected upload.
    const file = new File([entry.blob], entry.name || "video.mp4", {
      type: entry.type || "video/mp4",
      lastModified: entry.lastModified || entry.savedAt || Date.now(),
    });
    return {
      file,
      savedAt: entry.savedAt || 0,
      expiresAt: entry.expiresAt || 0,
    };
  } catch (e) {
    console.warn("[videoStore] load failed:", e?.message || e);
    return null;
  }
}

/**
 * Delete the cached video. Called on explicit "start over" gestures so
 * a refresh doesn't restore the user's last clip.
 */
export async function purgeVideo(key = KEY) {
  try {
    const db = await _openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idb delete failed"));
    });
    return true;
  } catch (e) {
    console.warn("[videoStore] purge failed:", e?.message || e);
    return false;
  }
}

/**
 * Light status probe — returns the cache header without bringing the
 * full Blob into memory. Used by the storage chip in the modal.
 *
 * @returns {Promise<{ has: boolean, sizeBytes: number, savedAt: number,
 *                     expiresAt: number, name: string } | null>}
 */
export async function videoStatus() {
  try {
    const db = await _openDb();
    const entry = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!entry) return { has: false };
    if (typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt) {
      return { has: false, expired: true };
    }
    return {
      has: true,
      sizeBytes: entry.size || (entry.blob && entry.blob.size) || 0,
      savedAt: entry.savedAt || 0,
      expiresAt: entry.expiresAt || 0,
      name: entry.name || "video.mp4",
    };
  } catch {
    return null;
  }
}
