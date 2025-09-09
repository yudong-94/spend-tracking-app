import { Transaction, AnalyticsData, ApiResponse } from "@spend-tracking/shared";

const API_BASE_URL = "/api";

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("API request failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  // Transaction endpoints
  async getTransactions(): Promise<ApiResponse<Transaction[]>> {
    return this.request<Transaction[]>("/transactions");
  }

  async getTransactionsWithAnalytics(params?: {
    startDate?: string;
    endDate?: string;
    type?: "income" | "expense" | "all";
    category?: string;
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.append("startDate", params.startDate);
    if (params?.endDate) searchParams.append("endDate", params.endDate);
    if (params?.type) searchParams.append("type", params.type);
    if (params?.category) searchParams.append("category", params.category);

    const queryString = searchParams.toString();
    const endpoint = `/transactions/with-analytics${queryString ? `?${queryString}` : ""}`;

    return this.request<any>(endpoint);
  }

  async addTransaction(
    transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt">,
  ): Promise<ApiResponse<Transaction>> {
    return this.request<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(transaction),
    });
  }

  async updateTransaction(
    id: string,
    transaction: Partial<Transaction>,
  ): Promise<ApiResponse<Transaction>> {
    return this.request<Transaction>(`/transactions/${id}`, {
      method: "PUT",
      body: JSON.stringify(transaction),
    });
  }

  async deleteTransaction(id: string): Promise<ApiResponse<boolean>> {
    return this.request<boolean>(`/transactions/${id}`, {
      method: "DELETE",
    });
  }

  // Analytics endpoints
  async getAnalytics(params?: {
    startDate?: string;
    endDate?: string;
    type?: "income" | "expense" | "all";
    category?: string;
  }): Promise<ApiResponse<AnalyticsData>> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.append("startDate", params.startDate);
    if (params?.endDate) searchParams.append("endDate", params.endDate);
    if (params?.type) searchParams.append("type", params.type);
    if (params?.category) searchParams.append("category", params.category);

    const queryString = searchParams.toString();
    const endpoint = `/transactions/analytics${queryString ? `?${queryString}` : ""}`;

    return this.request<AnalyticsData>(endpoint);
  }

  async getCategories(): Promise<string[]> {
    const response = await this.request<string[]>("/transactions/categories");
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<any>> {
    return this.request<any>("/health");
  }
}

export const apiService = new ApiService();
export default apiService;
