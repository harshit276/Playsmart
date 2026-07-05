import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const rootElement = document.getElementById("root");
// Hydrate ONLY genuine prerendered markup (whose DOM matches <App/>'s output).
// The static SEO fallback in index.html is tagged data-render="fallback" — it
// deliberately does NOT match <App/>, so we clear it and mount fresh with
// createRoot instead of hydrating (a mismatch would corrupt the live UI).
const isPrerendered =
  rootElement.hasChildNodes() && rootElement.dataset.render !== "fallback";
if (isPrerendered) {
  ReactDOM.hydrateRoot(
    rootElement,
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  rootElement.innerHTML = "";
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Register PWA service worker + show "new version available" prompt
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => {
        // Periodic update checks (hourly while tab is open)
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

        const promptUserToUpdate = (worker) => {
          // Only nudge if there's already a controller (i.e. this is an update,
          // not the very first install)
          if (!navigator.serviceWorker.controller) return;
          // Tiny non-blocking confirm — avoids pulling sonner into the entry chunk
          const accept = window.confirm(
            'A new version of Formanti is available. Reload to update?'
          );
          if (accept) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        };

        // A worker may already be waiting when we register
        if (reg.waiting) promptUserToUpdate(reg.waiting);

        // Or one may install while we're on the page
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') promptUserToUpdate(newWorker);
          });
        });
      })
      .catch(() => {
        // Best-effort — site still works without SW
      });

    // When the active SW changes (after SKIP_WAITING + claim), reload once
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
