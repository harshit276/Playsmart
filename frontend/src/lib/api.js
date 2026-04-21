import axios from 'axios';

const backendUrl = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
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
