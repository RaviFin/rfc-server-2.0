import { Router } from "express";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  transferAmount,
  updateTransaction,
} from "../controllers/transaction.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, createTransaction);
router.get("/", verifyJWT, listTransactions);
router.get("/:id", verifyJWT, getTransaction);
router.patch("/:id", verifyJWT, updateTransaction);
router.delete("/:id", verifyJWT, deleteTransaction);
router.post("/transfer", verifyJWT, transferAmount);

export default router;
