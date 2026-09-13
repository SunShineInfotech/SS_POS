// src/services/category.types.ts

export interface Category {
  category_id: string;
  company_id: string;
  franchise_id: string;
  category_name: string;
  category_status: 1 | 2; // 1=Active, 2=Inactive
  is_deleted: string;
  c_date: string;
  u_date: string;
}

export interface CategoryPayload {
  type: number;
  company_id: string;
  franchise_id: string;
  category_id?: number;
  category_name: string;
  category_status: 1 | 2;
}

export interface CategoryListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Category[];
  total?: number;
}

export interface CategoryDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Category;
}