import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import { toast } from 'sonner';

export const useAuthStore = create((set) => ({
  authUser: null,
  isCheckingAuth: false,
  isLoading: false,

  checkAuth: async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      set({ authUser: null, isCheckingAuth: false });
      return;
    }

    try {
      set({ isCheckingAuth: true });
      const response = await axiosInstance.get('/auth/me');
      set({ 
        authUser: response.data.user
      });
    } catch (error) {
      console.error("Check auth error:", error);
      localStorage.removeItem('authToken');
      set({ 
        authUser: null
      });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  login: async (credentials) => {
    try {
      set({ isLoading: true });
      const response = await axiosInstance.post('/auth/login', credentials);
      
      const { token, user } = response.data;
      if (token) {
        localStorage.setItem('authToken', token);
      }
      
      set({ 
        authUser: user
      });
      
      toast.success("Login successful");
      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      const message = error.response?.data?.message || "Login failed";
      toast.error(message);
      return { success: false, error: message };
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (credentials) => {
    try {
      set({ isLoading: true });
      const response = await axiosInstance.post('/auth/register', credentials);
      
      const { token, user } = response.data;
      if (token) {
        localStorage.setItem('authToken', token);
      }
      
      set({ 
        authUser: user
      });
      
      toast.success("Registration successful");
      return { success: true };
    } catch (error) {
      console.error("Register error:", error);
      const message = error.response?.data?.message || "Registration failed";
      toast.error(message);
      return { success: false, error: message };
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.get('/auth/logout');
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.removeItem('authToken');
      sessionStorage.clear();

      // Clear accessible cookies
      try {
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
      } catch (e) {
        // ignore
      }

      // Clear axios default Authorization header if present
      if (axiosInstance.defaults?.headers?.common) {
        delete axiosInstance.defaults.headers.common['Authorization'];
      }

      set({ authUser: null });
      toast.success("Logged out successfully");

      // Redirect if currently on workspace
      if (window.location.pathname !== '/' && window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
  }
}));