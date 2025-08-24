import { Router } from "express";
import {
  createTransaction,
  deleteTransaction,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
} from "../controllers/transaction.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, createTransaction);
router.get("/", verifyJWT, getAllTransactions);
router.get("/:id", verifyJWT, getTransactionById);
router.patch("/:id", verifyJWT, updateTransaction);
router.delete("/:id", verifyJWT, deleteTransaction);

export default router;
