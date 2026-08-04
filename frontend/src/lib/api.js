import axios from 'axios';

let backendUrl = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/+$/, '');
// Guard against a scheme-less value (e.g. "formanti.com"): without http(s)://
// the browser treats it as a RELATIVE path and appends it to the current
// origin → "https://formanti.com/formanti.com/api/..." (a doubled-domain
// that matches no API route and 405s). Normalise by adding https:// when a
// host is given but no scheme. An EMPTY value stays empty → same-origin "/api",
// which is the correct default for our Vercel co-deployed API.
if (backendUrl && !/^https?:\/\//i.test(backendUrl)) {
  backendUrl = `https://${backendUrl}`;
}
// CRITICAL (post-rebrand): the API is co-deployed with the frontend on EVERY
// domain (atheonics.com, formanti.com/.in, *.vercel.app previews, and the
// Capacitor APK's server.url). So the correct backend is ALWAYS the page's own
// origin. If REACT_APP_BACKEND_URL points at a DIFFERENT origin than the one
// the app is being served from (e.g. the build baked in atheonics.com but the
// user is on formanti.com), honoring it makes every /api call cross-origin →
// a CORS preflight that fails → "network error" on login/upload/etc. Prefer
// same-origin whenever we're in a browser on a different host; this makes the
// app self-contained per domain and immune to a stale REACT_APP_BACKEND_URL.
if (typeof window !== 'undefined' && window.location && window.location.origin) {
  const here = window.location.origin;
  if (!backendUrl || backendUrl.replace(/\/+$/, '') !== here) {
    backendUrl = ''; // relative → same-origin /api
  }
}
const API_URL = `${backendUrl}/api`;

// Resolved backend origin ("" = same-origin/relative). Exported so raw fetch()
// / EventSource callers (which don't go through the axios `api` client) use the
// SAME same-origin-corrected base — otherwise they'd rebuild the URL from the
// stale REACT_APP_BACKEND_URL and hit a cross-origin CORS wall (e.g. formanti
// → atheonics on /analyze-jobs/{id}/run and /analyze-video-stream).
export const API_ORIGIN = backendUrl; // e.g. "" (relative) or "https://host"

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('playsmart_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Only drop the token when the AUTHENTICATION endpoint specifically
// says the JWT is invalid. Previously, a random 401 from any other
// endpoint (e.g. a misclassified DB error) was logging users out.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      const isAuthEndpoint = url.includes('/auth/me') || url.includes('/auth/refresh');
      if (isAuthEndpoint) {
        localStorage.removeItem('playsmart_token');
        localStorage.removeItem('playsmart_user');
      }
      // Never auto-redirect — let the AuthProvider decide based on real
      // state so users stay on the page they were viewing.
    }
    return Promise.reject(err);
  }
);

export default api;
