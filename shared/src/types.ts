export interface Transaction {
  id: string;
  date: string; // ISO date string
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon?: string;
}

export interface MonthlySummary {
  month: string; // YYYY-MM format
  income: number;
  expenses: number;
  netCashFlow: number;
  transactionCount: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface PeriodFilter {
  startDate: string;
  endDate: string;
  type?: 'income' | 'expense' | 'all';
  category?: string;
}

export interface AnalyticsData {
  monthlyTrends: MonthlySummary[];
  categoryBreakdown: CategoryBreakdown[];
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  period: PeriodFilter;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  credentials: {
    client_email: string;
    private_key: string;
  };
  ranges: {
    transactions: string;
    categories: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
