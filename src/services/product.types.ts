// src/services/product.types.ts

export type ProductType = 1 | 2 | 3; // 1=Sales, 2=Purchase, 3=Both

export interface Product {
  product_id: string;
  company_id: string;
  franchise_id: string;
  product_cat_id: string;
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

// API response for list
export interface ProductListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Product[];
  total?: number;
}

// API response for single product
export interface ProductDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Product;
}