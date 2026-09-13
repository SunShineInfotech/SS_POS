// src/services/product.service.ts
import { apiClient } from './api.config';

/* ============================================================
   TYPES
   ============================================================ */

export type ProductType = 1 | 2 | 3; // 1=Sales, 2=Purchase, 3=Both

export interface Product {
  product_id: string;
  company_id: string;
  franchise_id: string;
  product_cat_id: string;
  // Populated by the list query's join with tbl_category — not present
  // on the single-product (case 5) response.
  category_name?: string;
  product_name: string;
  product_variant_name: string | null;
  product_image: string | null;
  product_base_price: number;
  product_cgst: number;
  product_sgst: number;
  product_igst: number;
  product_mrp_with_gst: number;
  product_final_amount: number;
  product_hsn_code: string | null;
  product_sku: string | null;
  product_is_active: 1 | 2; // 1=Active, 2=Inactive
  product_weight: string | null;
  product_stock: number;
  product_type: ProductType;
  product_reference_code: string | null;
  product_code: string | null;
  product_unit_it: string | null;
  product_priority: number;
  product_is_main: number;
  is_deleted: string;
  c_date: string;
  u_date: string;
}

// Fields sent to API (create/update)
export interface ProductPayload {
  type: number; // API operation type (1=insert, 3=update)
  company_id: string;
  franchise_id: string;
  product_id?: number; // only for update
  product_reference_code?: string;
  product_cat_id: number;
  product_name: string;
  product_variant_name?: string;
  product_image?: string; // base64 or existing path
  product_base_price: number;
  product_cgst: number;
  product_sgst: number;
  product_igst: number;
  product_mrp_with_gst: number;
  product_final_amount: number;
  product_hsn_code?: string;
  product_sku?: string;
  product_is_main?: number;
  product_priority?: number;
  product_is_active: 1 | 2;
  product_weight?: string;
  product_stock: number;
  product_unit_it?: string;
  product_code?: string;
  product_type: ProductType;
}

export interface ProductListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Product[];
  total?: number;
}

export interface ProductDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Product;
}

/* ============================================================
   SERVICE
   ============================================================ */

export class ProductService {
  static async getProducts(company_id: string, franchise_id: string): Promise<ProductListResponse> {
    const res = await apiClient.post('/product.php', { type: 2, company_id, franchise_id });
    return res.data;
  }

  static async getProduct(product_id: number, company_id: string, franchise_id: string): Promise<ProductDetailResponse> {
    const res = await apiClient.post('/product.php', { type: 5, product_id, company_id, franchise_id });
    return res.data;
  }

  static async createProduct(payload: Omit<ProductPayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/product.php', { type: 1, ...payload });
    return res.data;
  }

  static async updateProduct(product_id: number, payload: Omit<ProductPayload, 'type' | 'product_id'>): Promise<any> {
    const res = await apiClient.post('/product.php', { type: 3, product_id, ...payload });
    return res.data;
  }

  static async deleteProduct(product_id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/product.php', { type: 4, product_id, company_id, franchise_id });
    return res.data;
  }
}