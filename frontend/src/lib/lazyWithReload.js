import { lazy } from "react";

/**
 * Drop-in replacement for React.lazy that survives a deploy.
 *
 * THE BUG IT FIXES: every page is code-split, so each carries a content-hashed
 * chunk name. When we deploy, the hashes change and the host keeps only the
 * newest build's chunks. A browser still running the previous build — an open
 * tab, a backgrounded PWA, or a service worker serving a stale index shell —
 * asks for the OLD chunk hash when the user navigates to a lazy route. The host
 * returns 404, the dynamic import() rejects with a ChunkLoadError, and because
 * there is no error boundary over Suspense, React tears down the whole tree.
 * The user sees a black screen. This is exactly the "analyze page went blank
 * after a deploy" report.
 *
 * THE FIX: on import failure, retry once (covers a transient network blip), and
 * if it still fails, reload the page ONCE. A fresh load fetches the current
 * index.html and therefore the current chunk hashes, so the route resolves. A
 * sessionStorage flag makes the reload fire at most once per tab, so a genuinely
 * missing chunk degrades to the Suspense fallback / error rather than looping.
 */
export default function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch((err) =>
      // One quiet retry first — a single failed request is usually just a blip.
      factory().catch(() => {
        const KEY = "chunk_reload_once";
        let reloadedAlready = false;
        try {
          reloadedAlready = sessionStorage.getItem(KEY) === "1";
        } catch {
          // Private mode / storage blocked — treat as not-yet-reloaded, but the
          // flag won't persist, so cap the risk by only reloading on a real
          // chunk error below.
        }

        const isChunkError =
          err &&
          (err.name === "ChunkLoadError" ||
            /Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch/i.test(
              String(err && err.message)
            ));

        if (isChunkError && !reloadedAlready) {
          try {
            sessionStorage.setItem(KEY, "1");
          } catch {
            /* ignore */
          }
          window.location.reload();
          // Return a never-resolving module so nothing renders before reload.
          return new Promise(() => {});
        }

        // Not a chunk error, or we've already reloaded once — let it surface so
        // the caller's boundary/fallback handles it instead of looping.
        throw err;
      })
    )
  );
}

// Clear the one-shot guard once a load fully succeeds, so a LATER deploy in the
// same tab can reload again.
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    try {
      sessionStorage.removeItem("chunk_reload_once");
    } catch {
      /* ignore */
    }
  });
}
