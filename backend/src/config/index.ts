import dotenv from "dotenv";
import { GoogleSheetsConfig } from "@spend-tracking/shared";

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  googleSheets: GoogleSheetsConfig;
  cors: {
    origin: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

function validateConfig(): AppConfig {
  const requiredEnvVars = [
    "GOOGLE_SHEETS_SPREADSHEET_ID",
    "GOOGLE_SHEETS_CREDENTIALS_EMAIL",
    "GOOGLE_SHEETS_PRIVATE_KEY",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    port: parseInt(process.env.PORT || "3001", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    googleSheets: {
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID!,
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CREDENTIALS_EMAIL!,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      },
      ranges: {
        transactions: process.env.GOOGLE_SHEETS_TRANSACTIONS_RANGE || "Transactions!A:F",
        categories: process.env.GOOGLE_SHEETS_CATEGORIES_RANGE || "Categories!A:E",
      },
    },
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
    },
  };
}

export const config = validateConfig();
