// src/services/employee.service.ts
import { apiClient } from './api.config';

// ----- TYPES -----
export interface Employee {
  employee_id: string;
  company_id: string;
  employee_franchisy_multiple_ids: string; // comma-separated
  employee_mobile: string;
  employee_password?: string;
  employee_otp?: string;
  employee_role_id: string;
  employee_permission: string; // JSON
  employee_name: string;
  employee_email: string;
  employee_salary_monthly: number;
  employee_joining_date: string;
  employee_last_login_time?: string;
  employee_last_login_ip?: string;
  employee_status: 1 | 2; // 1=Active, 2=Inactive
  software_version?: string;
  is_deleted: string;
  c_date: string;
  u_date: string;
  // derived from join (list)
  franchise_names?: string;
}

export interface EmployeePayload {
  type: number;
  company_id: string;
  employee_id?: number;
  employee_name: string;
  employee_mobile: string;
  employee_email: string;
  employee_password?: string; // required on create, optional on update
  employee_salary: number;
  employee_joining_date: string;
  employee_status: 1 | 2;
  employee_role_id?: number;
  employee_permission?: string; // JSON
  employee_franchisy_multiple_ids: string; // comma-separated IDs
}

export interface EmployeeListResponse {
  status: 'success' | 'error';
  message: string;
  data?: Employee[];
  total?: number;
}

export interface EmployeeDetailResponse {
  status: 'success' | 'error';
  message: string;
  data?: Employee;
}

export interface ChangePasswordPayload {
  employee_id: number;
  company_id: string;
  new_password: string;
}

// ----- SERVICE -----
export class EmployeeService {
  static async getEmployees(company_id: string): Promise<EmployeeListResponse> {
    const res = await apiClient.post('/employee.php', { type: 2, company_id });
    return res.data;
  }

  static async getEmployee(employee_id: number, company_id: string): Promise<EmployeeDetailResponse> {
    const res = await apiClient.post('/employee.php', { type: 5, employee_id, company_id });
    return res.data;
  }

  static async createEmployee(payload: Omit<EmployeePayload, 'type'>): Promise<any> {
    const res = await apiClient.post('/employee.php', { type: 1, ...payload });
    return res.data;
  }

  static async updateEmployee(employee_id: number, payload: Omit<EmployeePayload, 'type' | 'employee_id'>): Promise<any> {
    const res = await apiClient.post('/employee.php', { type: 3, employee_id, ...payload });
    return res.data;
  }

  static async deleteEmployee(employee_id: number, company_id: string): Promise<any> {
    const res = await apiClient.post('/employee.php', { type: 4, employee_id, company_id });
    return res.data;
  }

  static async changePassword(payload: ChangePasswordPayload): Promise<any> {
    const res = await apiClient.post('/employee.php', {
      type: 6,
      employee_id: payload.employee_id,
      company_id: payload.company_id,
      employee_password: payload.new_password,
    });
    return res.data;
  }
}