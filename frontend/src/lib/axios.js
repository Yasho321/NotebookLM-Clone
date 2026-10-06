import axios from 'axios';

export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8080/api/v1' : 'https://chithhi-api.yasho.tech/api/v1');

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// Request interceptor to add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: on 401, try ONCE to refresh the access token (via the httpOnly
// refresh cookie) and retry the original request. Only if that fails do we log out.
// Concurrent 401s share a single in-flight refresh so we don't fire many.
let refreshPromise = null;

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || '';
    const isAuthCall =
      url.includes('/auth/refresh') || url.includes('/auth/login') || url.includes('/auth/register');

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise || axiosInstance.post('/auth/refresh');
        const res = await refreshPromise;
        refreshPromise = null;

        const newToken = res.data?.token;
        if (newToken) localStorage.setItem('authToken', newToken);

        // Retry the original request (the request interceptor re-applies the new token).
        return axiosInstance(original);
      } catch (refreshErr) {
        refreshPromise = null;
        localStorage.removeItem('authToken');
        if (window.location.pathname !== '/' && window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
