import { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { GoogleSheetsService } from "../services/googleSheets";
import { Transaction, ApiResponse } from "@spend-tracking/shared";
import {
  calculateMonthlySummaries,
  calculateCategoryBreakdown,
  filterTransactionsByPeriod,
  getDefaultPeriodFilter,
} from "@spend-tracking/shared";

export class TransactionController {
  private googleSheetsService: GoogleSheetsService;

  constructor() {
    this.googleSheetsService = new GoogleSheetsService();
  }

  // Validation middleware
  static validateTransaction = [
    body("date").isISO8601().withMessage("Date must be a valid ISO date"),
    body("amount").isFloat({ min: 0 }).withMessage("Amount must be a positive number"),
    body("type").isIn(["income", "expense"]).withMessage("Type must be either income or expense"),
    body("category").notEmpty().withMessage("Category is required"),
    body("description").optional().isString().withMessage("Description must be a string"),
  ];

  // Get all transactions
  async getTransactions(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.googleSheetsService.getTransactions();

      if (!result.success) {
        res.status(500).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      console.error("Error in getTransactions:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get transactions with analytics
  async getTransactionsWithAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, type, category } = req.query;

      const result = await this.googleSheetsService.getTransactions();

      if (!result.success || !result.data) {
        res.status(500).json(result);
        return;
      }

      const transactions = result.data;

      // Apply filters if provided
      const periodFilter = {
        startDate: (startDate as string) || getDefaultPeriodFilter().startDate,
        endDate: (endDate as string) || getDefaultPeriodFilter().endDate,
        type: (type as "income" | "expense" | "all") || "all",
        category: (category as string) || undefined,
      };

      const filteredTransactions = filterTransactionsByPeriod(transactions, periodFilter);
      const monthlyTrends = calculateMonthlySummaries(transactions);
      const categoryBreakdown = calculateCategoryBreakdown(transactions, periodFilter);

      const totalIncome = filteredTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);

      const totalExpenses = filteredTransactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

      const analyticsData = {
        transactions: filteredTransactions,
        monthlyTrends,
        categoryBreakdown,
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
        period: periodFilter,
      };

      res.json({
        success: true,
        data: analyticsData,
      });
    } catch (error) {
      console.error("Error in getTransactionsWithAnalytics:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Add new transaction
  async addTransaction(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: errors.array(),
        });
        return;
      }

      const { date, amount, type, category, description } = req.body;

      const newTransaction = {
        date,
        amount: parseFloat(amount),
        type,
        category,
        description,
      };

      const result = await this.googleSheetsService.addTransaction(newTransaction);

      if (!result.success) {
        res.status(500).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("Error in addTransaction:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Update transaction
  async updateTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: errors.array(),
        });
        return;
      }

      const { date, amount, type, category, description } = req.body;

      const updatedTransaction: Transaction = {
        id,
        date,
        amount: parseFloat(amount),
        type,
        category,
        description,
        createdAt: new Date().toISOString(), // Will be updated by service
        updatedAt: new Date().toISOString(),
      };

      const result = await this.googleSheetsService.updateTransaction(updatedTransaction);

      if (!result.success) {
        res.status(500).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      console.error("Error in updateTransaction:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Delete transaction
  async deleteTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.googleSheetsService.deleteTransaction(id);

      if (!result.success) {
        res.status(500).json(result);
        return;
      }

      res.json({
        success: true,
        message: "Transaction deleted successfully",
      });
    } catch (error) {
      console.error("Error in deleteTransaction:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get analytics data
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, type, category } = req.query;

      const result = await this.googleSheetsService.getTransactions();

      if (!result.success || !result.data) {
        res.status(500).json(result);
        return;
      }

      const transactions = result.data;

      const periodFilter = {
        startDate: (startDate as string) || getDefaultPeriodFilter().startDate,
        endDate: (endDate as string) || getDefaultPeriodFilter().endDate,
        type: (type as "income" | "expense" | "all") || "all",
        category: (category as string) || undefined,
      };

      const filteredTransactions = filterTransactionsByPeriod(transactions, periodFilter);
      const monthlyTrends = calculateMonthlySummaries(transactions, periodFilter);
      const categoryBreakdown = calculateCategoryBreakdown(transactions, periodFilter);

      const totalIncome = filteredTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);

      const totalExpenses = filteredTransactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

      const analyticsData = {
        monthlyTrends,
        categoryBreakdown,
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
        period: periodFilter,
      };

      res.json({
        success: true,
        data: analyticsData,
      });
    } catch (error) {
      console.error("Error in getAnalytics:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get categories
  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.googleSheetsService.getCategories();

      if (!result.success) {
        res.status(500).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      console.error("Error in getCategories:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}
