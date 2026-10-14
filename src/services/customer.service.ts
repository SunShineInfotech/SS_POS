// src/services/customer.service.ts
import { apiClient } from './api.config';

/* ============================================================
   TYPES
   ============================================================ */

export interface CustomerPayload {
  company_id: string;
  franchise_id?: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string;
  customer_state_id?: string | number;
  customer_city?: string;
  customer_address?: string;
  customer_pincode?: string;
  customer_wallet_balance?: number;
}

// Row shape returned by list / lookup / single fetch (types 2, 5, 6)
export interface CustomerRow {
  customer_id: string;
  company_id: string;
  franchise_id: string | null;
  customer_name: string;
  customer_mobile: string;
  customer_email: string | null;
  customer_state_id: string | null;
  state_name: string | null;
  customer_city: string | null;
  customer_address: string | null;
  customer_pincode: string | null;
  customer_wallet_balance: string | null;
  is_deleted: string; // '1' = active, '0' = soft-deleted
  c_date: string;
}

export interface CustomerSaveResponse {
  status: 'success' | 'error';
  message: string;
  customer_id?: number;
  /** Fields sent but not stored because tbl_customer has no column for them */
  skipped_fields?: string[];
}

export interface CustomerListResponse {
  status: 'success' | 'error';
  message: string;
  data?: CustomerRow[];
  total?: number;
}

export interface CustomerLookupResponse {
  status: 'success' | 'error';
  message: string;
  found?: boolean;
  data?: CustomerRow | null;
}

export interface CustomerDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: CustomerRow;
}

export interface StateRow {
  state_id: string;
  state_name: string;
  state_active_inactive: string;
}

export interface StateListResponse {
  status: 'success' | 'error';
  message: string;
  data?: StateRow[];
}

/* ============================================================
   HELPER
   customer.php returns 4xx with a JSON body for validation /
   duplicate errors — surface that body instead of a raw axios
   exception so callers can show the API message.
   ============================================================ */

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.post(url, body);
    return res.data as T;
  } catch (error: any) {
    if (error?.response?.data && typeof error.response.data === 'object') {
      return error.response.data as T;
    }
    throw error;
  }
}

/* ============================================================
   SERVICE
   ============================================================ */

export class CustomerService {
  static createCustomer(payload: CustomerPayload): Promise<CustomerSaveResponse> {
    return post('/customer.php', { type: 1, ...payload });
  }

  static getCustomers(company_id: string, franchise_id?: string): Promise<CustomerListResponse> {
    return post('/customer.php', { type: 2, company_id, franchise_id });
  }

  static updateCustomer(customer_id: number, payload: CustomerPayload): Promise<CustomerSaveResponse> {
    return post('/customer.php', { type: 3, customer_id, ...payload });
  }

  static deleteCustomer(customer_id: number, company_id: string): Promise<CustomerSaveResponse> {
    return post('/customer.php', { type: 4, customer_id, company_id });
  }

  /** POS lookup — `found: false` + `data: null` means the number is not registered */
  static findByMobile(customer_mobile: string, company_id: string, franchise_id?: string): Promise<CustomerLookupResponse> {
    return post('/customer.php', { type: 5, customer_mobile, company_id, franchise_id });
  }

  static getCustomer(customer_id: number, company_id: string): Promise<CustomerDetailResponse> {
    return post('/customer.php', { type: 6, customer_id, company_id });
  }

  static restoreCustomer(customer_id: number, company_id: string): Promise<CustomerSaveResponse> {
    return post('/customer.php', { type: 7, customer_id, company_id });
  }

  /** Active states for the customer form dropdown (state.php type 2) */
  static getStates(company_id: string): Promise<StateListResponse> {
    return post('/state.php', { type: 2, company_id });
  }
}