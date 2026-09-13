import { apiClient } from './api.config';

export interface KOTItem {
  product_id: number;
  qty: number;
  special_instruction?: string;
}

export interface CreateKOTPayload {
  company_id: string;
  franchise_id: string;
  financial_year_id: number;
  table_id: number;
  customer_id?: number;
  employee_id?: number;
  order_type: number; // 1=Dine-in, 2=Takeaway, etc.
  remark?: string;
  items: KOTItem[];
}

export interface UpdateKOTStatusPayload {
  kot_id: number;
  kot_status: number; // 1=Pending,2=Preparing,3=Ready,4=Served,5=Cancelled
  company_id: string;
  franchise_id: string;
}

export class KOTService {
  static async createKOT(payload: CreateKOTPayload): Promise<any> {
    const res = await apiClient.post('/kot.php', { type: 1, ...payload });
    return res.data;
  }

  static async listKOTs(company_id: string, franchise_id: string, status?: number): Promise<any> {
    const res = await apiClient.post('/kot.php', {
      type: 2,
      company_id,
      franchise_id,
      kot_status: status || 0,
    });
    return res.data;
  }

  static async updateStatus(payload: UpdateKOTStatusPayload): Promise<any> {
    const res = await apiClient.post('/kot.php', { type: 3, ...payload });
    return res.data;
  }

  static async getKOT(kot_id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/kot.php', {
      type: 4,
      kot_id,
      company_id,
      franchise_id,
    });
    return res.data;
  }
}