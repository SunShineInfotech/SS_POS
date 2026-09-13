// src/services/category.service.ts
import { apiClient } from './api.config';
import {
  CategoryListResponse,
  CategoryDetailResponse,
  CategoryPayload,
} from './category.types';

export class CategoryService {
  static async getCategories(
    company_id: string,
    franchise_id: string
  ): Promise<CategoryListResponse> {
    const response = await apiClient.post('/category.php', {
      type: 2,
      company_id,
      franchise_id,
    });
    return response.data;
  }

  static async getCategory(
    category_id: number,
    company_id: string,
    franchise_id: string
  ): Promise<CategoryDetailResponse> {
    const response = await apiClient.post('/category.php', {
      type: 5,
      category_id,
      company_id,
      franchise_id,
    });
    return response.data;
  }

  static async createCategory(
    payload: Omit<CategoryPayload, 'type'>
  ): Promise<any> {
    const response = await apiClient.post('/category.php', {
      type: 1,
      ...payload,
    });
    return response.data;
  }

  static async updateCategory(
    category_id: number,
    payload: Omit<CategoryPayload, 'type' | 'category_id'>
  ): Promise<any> {
    const response = await apiClient.post('/category.php', {
      type: 3,
      category_id,
      ...payload,
    });
    return response.data;
  }

  static async deleteCategory(
    category_id: number,
    company_id: string,
    franchise_id: string
  ): Promise<any> {
    const response = await apiClient.post('/category.php', {
      type: 4,
      category_id,
      company_id,
      franchise_id,
    });
    return response.data;
  }
}