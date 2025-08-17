import { Router } from "express";
import {
  closeLoan,
  collectLoanPayment,
  createLoan,
  defaultLoan,
  getLoan,
  listLoans,
  updateLoan,
} from "../controllers/loan.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, createLoan);
router.get("/", verifyJWT, listLoans);
router.get("/:id", verifyJWT, getLoan);
router.patch("/:id", verifyJWT, updateLoan);
router.post("/:id/close", verifyJWT, closeLoan);
router.post("/:id/default", verifyJWT, defaultLoan);
router.post("/:loanId/collect", verifyJWT, collectLoanPayment);

export default router;
