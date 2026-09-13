import { apiClient } from './api.config';

export interface CartItem {
  product_id: number;
  qty: number;
}

export interface CartPayload {
  type: number;
  company_id: string;
  franchise_id: string;
  table_id: number;
  customer_name?: string;
  customer_mobile?: string;
  discount_type?: string;
  discount_value?: number;
  items: CartItem[];
}

export interface CartResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    items: CartItem[];
    customer: { name: string; mobile: string };
  };
}

export class CartService {
  static async saveCart(payload: Omit<CartPayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/cart.php', { type: 1, ...payload });
    return res.data;
  }

  static async getCart(company_id: string, franchise_id: string, table_id: number): Promise<CartResponse> {
    const res = await apiClient.post('/cart.php', {
      type: 2,
      company_id,
      franchise_id,
      table_id,
    });
    return res.data;
  }

  static async clearCart(company_id: string, franchise_id: string, table_id: number): Promise<any> {
    const res = await apiClient.post('/cart.php', {
      type: 3,
      company_id,
      franchise_id,
      table_id,
    });
    return res.data;
  }
}