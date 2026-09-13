// src/services/vendor.service.ts
import { apiClient } from './api.config';

export interface Vendor {
  vendor_id: string;
  company_id: string;
  franchise_id: string;
  vendor_name: string;
  vendor_mobile_no: string;
  vendor_email_id: string;
  vendor_state_id: string;
  vendor_city_name: string;
  vendor_address: string;
  vendor_gst_number: string;
  vendor_wallet: number;
  is_deleted: string;
  c_date: string;
  u_date: string;
}

export interface VendorPayload {
  type: number;
  company_id: string;
  franchise_id: string;
  vendor_id?: number;
  vendor_name: string;
  vendor_mobile_no: string;
  vendor_email_id: string;
  vendor_state_id: number;
  vendor_city_name: string;
  vendor_address: string;
  vendor_gst_number: string;
  vendor_wallet?: number; // optional on update
}

export interface VendorListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Vendor[];
  total?: number;
}

export interface VendorDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Vendor;
}

export class VendorService {
  static async getVendors(company_id: string, franchise_id: string): Promise<VendorListResponse> {
    const res = await apiClient.post('/vendor.php', {
      type: 2,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async getVendor(vendor_id: number, company_id: string, franchise_id: string): Promise<VendorDetailResponse> {
    const res = await apiClient.post('/vendor.php', {
      type: 5,
      vendor_id,
      company_id,
      franchise_id,
    });
    return res.data;
  }

  static async createVendor(payload: Omit<VendorPayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/vendor.php', {
      type: 1,
      ...payload,
    });
    return res.data;
  }

  static async updateVendor(vendor_id: number, payload: Omit<VendorPayload, 'type' | 'vendor_id'>): Promise<any> {
    const res = await apiClient.post('/vendor.php', {
      type: 3,
      vendor_id,
      ...payload,
    });
    return res.data;
  }

  static async deleteVendor(vendor_id: number, company_id: string, franchise_id: string): Promise<any> {
    const res = await apiClient.post('/vendor.php', {
      type: 4,
      vendor_id,
      company_id,
      franchise_id,
    });
    return res.data;
  }
}