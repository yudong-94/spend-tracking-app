import { Router } from "express";
import { TransactionController } from "../controllers/transactionController";
import rateLimit from "express-rate-limit";

const router = Router();
const transactionController = new TransactionController();

// Rate limiting middleware
const createTransactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: "Too many transaction creation requests, please try again later.",
  },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});

// GET routes
router.get("/", generalLimiter, transactionController.getTransactions.bind(transactionController));
router.get(
  "/analytics",
  generalLimiter,
  transactionController.getAnalytics.bind(transactionController),
);
router.get(
  "/with-analytics",
  generalLimiter,
  transactionController.getTransactionsWithAnalytics.bind(transactionController),
);
router.get("/categories", transactionController.getCategories.bind(transactionController));

// POST routes
router.post(
  "/",
  createTransactionLimiter,
  TransactionController.validateTransaction,
  transactionController.addTransaction.bind(transactionController),
);

// PUT routes
router.put(
  "/:id",
  createTransactionLimiter,
  TransactionController.validateTransaction,
  transactionController.updateTransaction.bind(transactionController),
);

// DELETE routes
router.delete(
  "/:id",
  generalLimiter,
  transactionController.deleteTransaction.bind(transactionController),
);

export default router;
