// packages/types/src/api.ts

export interface PaginationQuery {
  page?: number;   // default: 1
  limit?: number;  // default: 20, max: 100
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

export interface SuccessResponse {
  success: true;
  message?: string;
}