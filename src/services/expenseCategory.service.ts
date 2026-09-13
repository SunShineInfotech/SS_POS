import { apiClient } from './api.config';

export interface ExpenseCategory {
  expenses_categories_id: number;
  company_id: string;
  franchise_id: string;
  expenses_categories_title: string;
  is_deleted: string;
  c_date: string;
  // u_date removed – not in your table
}

export interface ExpenseCategoryPayload {
  type: number;
  company_id: string;
  franchise_id: string;
  expenses_categories_id?: number;
  expenses_categories_title: string;
}

export interface ListResponse {
  status: 'success' | 'error';
  message: string;
  data?: ExpenseCategory[];
  total?: number;
}

export interface DetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: ExpenseCategory;
}

export class ExpenseCategoryService {
  static async getList(company_id: string, franchise_id: string): Promise<ListResponse> {
    const res = await apiClient.post('/expense_category.php', {
      type: 2,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async getOne(id: number, company_id: string, franchise_id: string): Promise<DetailResponse> {
    const res = await apiClient.post('/expense_category.php', {
      type: 5,
      expenses_categories_id: id,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async create(payload: Omit<ExpenseCategoryPayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/expense_category.php', {
      type: 1,
      ...payload,
    });
    return res.data;
  }

  static async update(id: number, payload: Omit<ExpenseCategoryPayload, 'type' | 'expenses_categories_id'>): Promise<any> {
    const res = await apiClient.post('/expense_category.php', {
      type: 3,
      expenses_categories_id: id,
      ...payload,
    });
    return res.data;
  }

  static async delete(id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/expense_category.php', {
      type: 4,
      expenses_categories_id: id,
      company_id,
      franchise_id,
    });
    return res.data;
  }
}