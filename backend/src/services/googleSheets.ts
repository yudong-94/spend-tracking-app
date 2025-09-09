import { google } from "googleapis";
import { Transaction, Category, ApiResponse } from "@spend-tracking/shared";
import { config } from "../config";

export class GoogleSheetsService {
  private sheets: any;
  private auth: any;

  constructor() {
    this.auth = new google.auth.JWT(
      config.googleSheets.credentials.client_email,
      undefined,
      config.googleSheets.credentials.private_key,
      ["https://www.googleapis.com/auth/spreadsheets"],
    );

    this.sheets = google.sheets({ version: "v4", auth: this.auth });
  }

  private async authenticate(): Promise<void> {
    try {
      await this.auth.authorize();
    } catch (error) {
      console.error("Google Sheets authentication failed:", error);
      throw new Error("Failed to authenticate with Google Sheets");
    }
  }

  async getTransactions(): Promise<ApiResponse<Transaction[]>> {
    try {
      await this.authenticate();

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.ranges.transactions,
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        return { success: true, data: [] };
      }

      // Skip header row and parse data
      const transactions: Transaction[] = rows.slice(1).map((row: any[], index: number) => ({
        id: row[0] || `generated-${Date.now()}-${index}`,
        date: row[1] || new Date().toISOString().split("T")[0],
        amount: parseFloat(row[2]) || 0,
        type: (row[3] || "expense") as "income" | "expense",
        category: row[4] || "Uncategorized",
        description: row[5] || "",
        createdAt: row[6] || new Date().toISOString(),
        updatedAt: row[7] || new Date().toISOString(),
      }));

      return { success: true, data: transactions };
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return { success: false, error: "Failed to fetch transactions" };
    }
  }

  async getCategories(): Promise<ApiResponse<Category[]>> {
    try {
      await this.authenticate();

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.ranges.categories,
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        return { success: true, data: [] };
      }

      // Skip header row and parse data
      const categories: Category[] = rows.slice(1).map((row: any[], index: number) => ({
        id: row[0] || `category-${Date.now()}-${index}`,
        name: row[1] || "Uncategorized",
        type: (row[2] || "expense") as "income" | "expense",
        color: row[3] || "#6B7280",
        icon: row[4] || undefined,
      }));

      return { success: true, data: categories };
    } catch (error) {
      console.error("Error fetching categories:", error);
      return { success: false, error: "Failed to fetch categories" };
    }
  }

  async addTransaction(
    transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt">,
  ): Promise<ApiResponse<Transaction>> {
    try {
      await this.authenticate();

      const newTransaction: Transaction = {
        ...transaction,
        id: `transaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const row = [
        newTransaction.id,
        newTransaction.date,
        newTransaction.amount.toString(),
        newTransaction.type,
        newTransaction.category,
        newTransaction.description || "",
        newTransaction.createdAt,
        newTransaction.updatedAt,
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.ranges.transactions,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [row],
        },
      });

      return { success: true, data: newTransaction };
    } catch (error) {
      console.error("Error adding transaction:", error);
      return { success: false, error: "Failed to add transaction" };
    }
  }

  async updateTransaction(transaction: Transaction): Promise<ApiResponse<Transaction>> {
    try {
      await this.authenticate();

      // First, find the row number for this transaction
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.ranges.transactions,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((row: any[]) => row[0] === transaction.id);

      if (rowIndex === -1) {
        return { success: false, error: "Transaction not found" };
      }

      const updatedTransaction = {
        ...transaction,
        updatedAt: new Date().toISOString(),
      };

      const row = [
        updatedTransaction.id,
        updatedTransaction.date,
        updatedTransaction.amount.toString(),
        updatedTransaction.type,
        updatedTransaction.category,
        updatedTransaction.description || "",
        updatedTransaction.createdAt,
        updatedTransaction.updatedAt,
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: `${config.googleSheets.ranges.transactions.split("!")[0]}!A${rowIndex + 1}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [row],
        },
      });

      return { success: true, data: updatedTransaction };
    } catch (error) {
      console.error("Error updating transaction:", error);
      return { success: false, error: "Failed to update transaction" };
    }
  }

  async deleteTransaction(transactionId: string): Promise<ApiResponse<boolean>> {
    try {
      await this.authenticate();

      // Find the row number for this transaction
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.ranges.transactions,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((row: any[]) => row[0] === transactionId);

      if (rowIndex === -1) {
        return { success: false, error: "Transaction not found" };
      }

      // Delete the row (add 1 because Sheets API is 1-indexed)
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.googleSheets.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: 0, // Assuming first sheet
                  dimension: "ROWS",
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          ],
        },
      });

      return { success: true, data: true };
    } catch (error) {
      console.error("Error deleting transaction:", error);
      return { success: false, error: "Failed to delete transaction" };
    }
  }
}
