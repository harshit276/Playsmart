/**
 * Can the browser actually read the video the user picked?
 *
 * WHY: on Android, a clip chosen from Google Photos / Drive is often still in
 * the cloud. The picker hands us a File, but every read of it fails with
 * NotReadableError ("The requested file could not be read, typically due to
 * permission problems…") until the phone finishes downloading it — or for
 * good, if the provider withdraws access. Every later step (rotation check,
 * upload, compression) then fails, and the user was told it was a network
 * problem. In one week that was 15 of 18 failed analyses, from two users who
 * retried 5 and 10 times before leaving.
 *
 * Reading a small slice from each end of the file fails exactly the way a full
 * read would, costs almost nothing, and — because a cloud download usually
 * finishes within seconds — waiting and retrying often turns a failure into a
 * normal analysis.
 */

const PROBE_BYTES = 64 * 1024;

export const UNREADABLE_MESSAGE =
  "We couldn't open this video from your phone. If it's in Google Photos or Drive, " +
  "open it there and tap Download (or \"Save to device\"), then pick it again from your Gallery or Files.";

export function isUnreadableError(err) {
  const s = `${err?.name || ""} ${err?.message || err || ""}`;
  return /NotReadableError|could not be read|permission problems/i.test(s);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(file) {
  await file.slice(0, PROBE_BYTES).arrayBuffer();
  if (file.size > PROBE_BYTES) {
    await file.slice(Math.max(0, file.size - PROBE_BYTES)).arrayBuffer();
  }
}

/**
 * Resolves when the file can be read. Retries for ~35s while a cloud copy
 * finishes downloading (onWait fires before each wait). Throws an error with
 * code "file_unreadable" if it never becomes readable; any other error is
 * rethrown untouched.
 */
export async function ensureReadable(file, { onWait, attempts = 7 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      await probe(file);
      return true;
    } catch (err) {
      if (!isUnreadableError(err)) throw err;
      if (i === attempts - 1) break;
      onWait?.(i);
      await sleep(2000 + i * 1500);
    }
  }
  const e = new Error(UNREADABLE_MESSAGE);
  e.code = "file_unreadable";
  throw e;
}
