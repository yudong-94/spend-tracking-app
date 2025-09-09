import { Transaction, MonthlySummary, CategoryBreakdown, PeriodFilter } from "./types";

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatMonth = (dateString: string): string => {
  // If it's a month key (YYYY-MM format), parse it directly
  if (/^\d{4}-\d{2}$/.test(dateString)) {
    const [year, month] = dateString.split("-").map(Number);
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  // Otherwise, treat as regular date
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
};

export const getMonthKey = (dateString: string): string => {
  // Parse the date and ensure it's treated as local time, not UTC
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day); // month - 1 because JS months are 0-indexed
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return monthKey;
};

export const calculateMonthlySummaries = (
  transactions: Transaction[],
  filter?: Partial<PeriodFilter>,
): MonthlySummary[] => {
  let filteredTransactions = transactions;

  if (filter?.category) {
    filteredTransactions = filteredTransactions.filter((t) => t.category === filter.category);
  }

  const monthlyData = new Map<string, { income: number; expenses: number; count: number }>();

  filteredTransactions.forEach((transaction) => {
    const monthKey = getMonthKey(transaction.date);
    const current = monthlyData.get(monthKey) || { income: 0, expenses: 0, count: 0 };

    if (transaction.type === "income") {
      current.income += transaction.amount;
    } else {
      current.expenses += transaction.amount;
    }
    current.count += 1;

    monthlyData.set(monthKey, current);
  });

  return Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      netCashFlow: data.income - data.expenses,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.month.localeCompare(a.month)); // Changed to descending order
};

export const calculateCategoryBreakdown = (
  transactions: Transaction[],
  filter?: Partial<PeriodFilter>,
): CategoryBreakdown[] => {
  let filteredTransactions = transactions;

  if (filter?.startDate && filter?.endDate) {
    filteredTransactions = transactions.filter(
      (t) => t.date >= filter.startDate! && t.date <= filter.endDate!,
    );
  }

  filteredTransactions = filteredTransactions.filter((t) => t.type === "expense");

  if (filter?.category) {
    filteredTransactions = filteredTransactions.filter((t) => t.category === filter.category);
  }

  const categoryTotals = new Map<string, { amount: number; count: number }>();

  filteredTransactions.forEach((transaction) => {
    const current = categoryTotals.get(transaction.category) || { amount: 0, count: 0 };
    current.amount += transaction.amount;
    current.count += 1;
    categoryTotals.set(transaction.category, current);
  });

  const totalAmount = Array.from(categoryTotals.values()).reduce(
    (sum, data) => sum + data.amount,
    0,
  );

  return Array.from(categoryTotals.entries())
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.amount - a.amount);
};

export const filterTransactionsByPeriod = (
  transactions: Transaction[],
  period: PeriodFilter,
): Transaction[] => {
  return transactions.filter(
    (transaction) =>
      transaction.date >= period.startDate &&
      transaction.date <= period.endDate &&
      (period.type === "all" || !period.type || transaction.type === period.type) &&
      (!period.category || transaction.category === period.category),
  );
};

export const getDefaultPeriodFilter = (): PeriodFilter => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: startOfMonth.toISOString().split("T")[0],
    endDate: endOfMonth.toISOString().split("T")[0],
    type: "all",
  };
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};
