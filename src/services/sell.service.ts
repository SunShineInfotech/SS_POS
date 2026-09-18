// src/services/sell.service.ts
import { apiClient } from './api.config';

/* ============================================================
   TYPES
   ============================================================ */

export interface SellItemPayload {
  product_id: number;
  single_product_price: number;
  qty: number;
  cgst?: number;
  sgst?: number;
  available_stock?: number;
  discount_type?: '%' | '₹';
  discount?: number;
}

export interface SellPayload {
  type: number; // API operation type (1 = create)
  company_id: string;
  franchise_id: string;
  sell_financial_year_id?: string | number;
  sell_date: string; // YYYY-MM-DD
  sell_table_id?: string | number;
  sell_total_amount: number;
  sell_total_discount_amount: number;
  sales_total_paid_amount: number;
  sales_total_remainng_amount: number;
  customer_mobile?: string;
  customer_name?: string;
  payment_mode?: string; // 'Cash' | 'Card' | 'UPI'
  items: SellItemPayload[];
}

export interface SellResponse {
  status: 'success' | 'error';
  message: string;
  sell_id?: number;
  sell_bill_number?: string;
  sell_customer_id?: number;
}

// Row shape returned by the sales list (type 2)
export interface SaleRow {
  sell_id: string;
  sell_bill_number: string;
  sell_date: string;
  sell_customer_id: string;
  sell_customer_name: string | null;
  sell_customer_number: string | null;
  sell_total_amount: string;
  sell_total_discount_amount: string;
  sales_total_paid_amount: string;
  sales_total_remainng_amount: string;
  sell_payment_stauts: string | null;
  sell_payment_mode: string | null;
  sell_table_id: string | null;
  is_deleted: string; // '1' = active, '0' = soft-deleted
  c_date: string;
  item_count: string;
}

export interface SalesListResponse {
  status: 'success' | 'error';
  message: string;
  data?: SaleRow[];
  total?: number;
}

// Line item shape returned by the single-bill fetch (type 5)
export interface SellDetailItem {
  sell_details_id: string;
  sell_details_product_id: string;
  sell_details_single_product_price: string;
  sell_details_product_qty: string;
  sell_details_product_amount: string;
  sell_details_product_cgst: string;
  sell_details_product_sgst: string;
  sell_details_totall_amount: string;
  sell_details_product_avalable_stock: string;
  sell_details_discount_type: string;
  sell_details_product_discount: string;
  product_name: string | null;
}

export interface SellDetail extends SaleRow {
  items: SellDetailItem[];
}

export interface SellDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: SellDetail;
}

/* ============================================================
   SERVICE
   ============================================================ */

export class SellService {
  static async createSell(payload: Omit<SellPayload, 'type'>): Promise<SellResponse> {
    const res = await apiClient.post('/sell.php', { type: 1, ...payload });
    return res.data;
  }

  static async getSales(company_id: string, franchise_id: string): Promise<SalesListResponse> {
    const res = await apiClient.post('/sell.php', { type: 2, company_id, franchise_id });
    return res.data;
  }

  static async deleteSale(sell_id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/sell.php', { type: 4, sell_id, company_id, franchise_id });
    return res.data;
  }

  static async restoreSale(sell_id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/sell.php', { type: 6, sell_id, company_id, franchise_id });
    return res.data;
  }

  static async getSale(sell_id: number, company_id: string, franchise_id: string): Promise<SellDetailResponse> {
    const res = await apiClient.post('/sell.php', { type: 5, sell_id, company_id, franchise_id });
    return res.data;
  }

  static async updateSell(sell_id: number, payload: Omit<SellPayload, 'type'>): Promise<SellResponse> {
    const res = await apiClient.post('/sell.php', { type: 3, sell_id, ...payload });
    return res.data;
  }
}