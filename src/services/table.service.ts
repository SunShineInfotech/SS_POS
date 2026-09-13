// src/services/table.service.ts
import { apiClient } from './api.config';

// ----- TYPES -----
export interface Table {
  table_id: string;
  company_id: string;
  franchise_id: string;
  table_no: string;
  table_status: 1 | 2 | 3 | 4; // 1=Free, 2=Occupied, 3=Reserved, 4=Out of Service
  table_Capacity: number; // note: capital C matches DB
  franchise_name?: string; // from join
  is_deleted: string;
  c_date: string;
  u_date: string;
}

export interface TablePayload {
  type: number;
  company_id: string;
  franchise_id: string;
  table_id?: number;
  table_no: string;
  table_status: number;
  table_capacity: number;
}

export interface TableListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Table[];
  total?: number;
}

export interface TableDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Table;
}

// ----- SERVICE -----
export class TableService {
  static async getTables(company_id: string, franchise_id: string): Promise<TableListResponse> {
    const res = await apiClient.post('/table_master.php', {
      type: 2,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async getTable(table_id: number, company_id: string, franchise_id: string): Promise<TableDetailResponse> {
    const res = await apiClient.post('/table_master.php', {
      type: 5,
      table_id,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async createTable(payload: Omit<TablePayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/table_master.php', {
      type: 1,
      ...payload,
    });
    return res.data;
  }

  static async updateTable(table_id: number, payload: Omit<TablePayload, 'type' | 'table_id'>): Promise<any> {
    const res = await apiClient.post('/table_master.php', {
      type: 3,
      table_id,
      ...payload,
    });
    return res.data;
  }

  static async deleteTable(table_id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/table_master.php', {
      type: 4,
      table_id,
      company_id,
      franchise_id,
    });
    return res.data;
  }
}