import { Router } from "express";
import {
  createTransaction,
  deleteTransaction,
  getAllTransactions,
  getTransactionById,
  getTransactionsByAccount,
  getTransactionsByCustomer,
  getTransactionsByLoan,
  getTransactionStats,
  updateTransaction,
} from "../controllers/transaction.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, createTransaction);
router.get("/", verifyJWT, getAllTransactions);
router.get("/stats", verifyJWT, getTransactionStats);
router.get("/:id", verifyJWT, getTransactionById);
router.get("/customer/:customerId", verifyJWT, getTransactionsByCustomer);

router.get("/loan/:loanId", verifyJWT, getTransactionsByLoan);
router.get("/account/:accountId", verifyJWT, getTransactionsByAccount);
router.patch("/:id", verifyJWT, updateTransaction);
router.delete("/:id", verifyJWT, deleteTransaction);

export default router;
