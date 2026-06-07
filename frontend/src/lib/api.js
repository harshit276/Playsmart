import axios from 'axios';

let backendUrl = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/+$/, '');
// Guard against a scheme-less value (e.g. "atheonics.com"): without http(s)://
// the browser treats it as a RELATIVE path and appends it to the current
// origin → "https://atheonics.com/atheonics.com/api/..." (a doubled-domain
// that matches no API route and 405s). Normalise by adding https:// when a
// host is given but no scheme. An EMPTY value stays empty → same-origin "/api",
// which is the correct default for our Vercel co-deployed API.
if (backendUrl && !/^https?:\/\//i.test(backendUrl)) {
  backendUrl = `https://${backendUrl}`;
}
const API_URL = `${backendUrl}/api`;

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
