// src/services/api.config.ts
import axios from 'axios';

// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'https://sunshineproduct.in/POS/v1_api/';

console.log('API URL:', API_URL); // Debug: Check if URL is correct

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Log request for debugging
    console.log('API Request:', {
      url: config.url,
      method: config.method,
      data: config.data,
      headers: config.headers
    });
    
    return config;
  },
  (error) => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Log response for debugging
    console.log('API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('Response Error:', error);
    
    // Handle 401 Unauthorized - redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      localStorage.removeItem('company_data');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Base service class with common methods
export abstract class BaseService {
  protected apiEndpoint: string;

  constructor(endpoint: string) {
    this.apiEndpoint = endpoint;
  }

  protected async post<T>(data: any): Promise<T> {
    try {
      console.log(`Calling API: ${this.apiEndpoint}`, data); // Debug
      const response = await apiClient.post(this.apiEndpoint, data);
      return response.data;
    } catch (error) {
      console.error(`API Error (${this.apiEndpoint}):`, error);
      throw error;
    }
  }

  protected handleError(error: any): string {
    return error.response?.data?.message || 'An unexpected error occurred';
  }
}

// Response types
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  total?: number;
}

export interface BaseEntity {
  id?: string;
  company_id?: string;
  is_deleted?: string;
  c_date?: string;
}