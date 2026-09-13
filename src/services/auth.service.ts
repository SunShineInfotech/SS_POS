// src/services/auth.service.ts
import { apiClient } from './api.config';
import {
  VerifyCompanyResponse,
  LoginResponse,
  SendOtpResponse,
  VerifyOtpResponse,
} from './auth.types';

export class AuthService {
  /**
   * Case 1: Verify company code
   */
  static async verifyCompany(company_code: string): Promise<VerifyCompanyResponse> {
    const response = await apiClient.post('/login.php', {
      type: 1,
      company_code,
    });
    return response.data;
  }

  /**
   * Case 2: Password login
   */
  static async loginWithPassword(
    company_code: string,
    mobile: string,
    password: string
  ): Promise<LoginResponse> {
    const response = await apiClient.post('/login.php', {
      type: 2,
      company_code,
      mobile,
      password,
    });
    return response.data;
  }

  /**
   * Case 3: Request OTP
   */
  static async sendOtp(
    company_code: string,
    mobile: string
  ): Promise<SendOtpResponse> {
    const response = await apiClient.post('/login.php', {
      type: 3,
      company_code,
      mobile,
    });
    return response.data;
  }

  /**
   * Case 4: Verify OTP
   */
  static async verifyOtp(
    company_code: string,
    mobile: string,
    otp: string
  ): Promise<VerifyOtpResponse> {
    const response = await apiClient.post('/login.php', {
      type: 4,
      company_code,
      mobile,
      otp,
    });
    return response.data;
  }
}