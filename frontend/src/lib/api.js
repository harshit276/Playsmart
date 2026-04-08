import axios from 'axios';

const backendUrl = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
const API_URL = `${backendUrl}/api`;

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('playsmart_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const hadToken = !!localStorage.getItem('playsmart_token');
      localStorage.removeItem('playsmart_token');
      localStorage.removeItem('playsmart_user');
      // Only redirect if user was previously logged in (token expired)
      // and not on pages that work for guests
      const guestPages = ['/', '/auth', '/analyze', '/highlights', '/equipment', '/training'];
      const currentPath = window.location.pathname;
      const isGuestPage = guestPages.some(p => currentPath === p || currentPath.startsWith(p + '/'));
      if (hadToken && !isGuestPage) {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
