import { create } from 'zustand';
import { axiosInstance } from '../lib/axios';
import toast from 'react-hot-toast';

export const useAuthStore = create((set) => ({
  authUser: null,
  isCheckingAuth: false,
  isLoading: false,

  checkAuth: async () => {
    try {
      set({ isCheckingAuth: true });
      const response = await axiosInstance.get('/auth/me');
      set({ 
        authUser: response.data.user
      });
    } catch (error) {
      console.error("Check auth error:", error);
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
      localStorage.setItem('authToken', token);
      
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
      localStorage.setItem('authToken', token);
      
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
      set({ authUser: null });
      toast.success("Logged out successfully");
    }
  }
}));