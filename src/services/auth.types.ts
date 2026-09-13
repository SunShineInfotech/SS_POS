// src/services/auth.types.ts
export interface Franchise {
  franchise_id: string;
  company_id: string;
  franchise_code: string;
  franchise_type: 1 | 2; // 1=Shop, 2=Restaurant
  franchise_billing_name: string;
  franchise_name: string;
  franchise_number: string;
  franchise_email: string;
  franchise_website: string;
  franchise_whatsapp_number: string;
  franchise_address: string;
  franchise_currency_symbol: string;
  franchise_invoice_prefix: string;
  franchise_invoice_id: string;
  franchise_renewal_date: string;
  franchise_renewal_amount: string;
  franchise_state_id: string;
  franchise_city_name: string;
  franchise_is_active: string;
  is_deleted: string;
  c_date: string;
  u_date: string;
}

export interface User {
  emp_id: string;
  name: string;
  employee_mobile: string;
  email: string;
  employee_permission: any;
}

export interface VerifyCompanyResponse {
  status: 'success' | 'error';
  message: string;
  company: Franchise;
  franchise_type: 1 | 2;
  renewal_expired: boolean;
  renewal_message: string;
}

export interface LoginResponse {
  status: 'success' | 'error';
  message: string;
  token?: string;
  user?: User;
  company?: Franchise;
  franchise_type: 1 | 2;
  renewal_expired: boolean;
  renewal_message: string;
}

export interface SendOtpResponse {
  status: 'success' | 'error';
  message: string;
  otp?: string; // only for testing
  mobile?: string;
}

export interface VerifyOtpResponse extends LoginResponse {}