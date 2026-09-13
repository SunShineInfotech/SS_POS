import { apiClient } from './api.config';

export interface Account {
  account_id: number;
  company_id: string;
  franchise_id: string;
  account_name: string;
  account_type: number;
  account_ifsc: string;
  account_number: string;
  account_branch_name: string;
  account_holder_name: string;
  account_balance: number;
  account_gst_number: string;
  is_deleted: string;
  c_date: string;
  u_date: string | null;
}

export interface AccountPayload {
  type: number;
  company_id: string;
  franchise_id: string;
  financial_year_id?: number;        // needed for opening balance transaction
  account_id?: number;
  account_name: string;
  account_type: number;
  account_ifsc?: string;
  account_number?: string;
  account_branch_name?: string;
  account_holder_name?: string;
  opening_balance?: number;          // used only on create
  account_gst_number?: string;
}

export interface ListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Account[];
  total?: number;
}

export interface DetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Account;
}

export class AccountService {
  static async getList(company_id: string, franchise_id: string): Promise<ListResponse> {
    const res = await apiClient.post('/account.php', {
      type: 2,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async getOne(id: number, company_id: string, franchise_id: string): Promise<DetailResponse> {
    const res = await apiClient.post('/account.php', {
      type: 5,
      account_id: id,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async create(payload: Omit<AccountPayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/account.php', {
      type: 1,
      ...payload,
    });
    return res.data;
  }

  static async update(id: number, payload: Omit<AccountPayload, 'type' | 'account_id' | 'opening_balance' | 'financial_year_id'>): Promise<any> {
    const res = await apiClient.post('/account.php', {
      type: 3,
      account_id: id,
      ...payload,
    });
    return res.data;
  }

  static async delete(id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/account.php', {
      type: 4,
      account_id: id,
      company_id,
      franchise_id,
    });
    return res.data;
  }
}