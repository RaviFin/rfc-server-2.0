import { Router } from "express";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  transferAmount,
  updateAccount,
} from "../controllers/account.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, createAccount);
router.get("/", verifyJWT, listAccounts);
router.get("/:id", verifyJWT, getAccount);
router.patch("/:id", verifyJWT, updateAccount);
router.delete("/:id", verifyJWT, deleteAccount);
router.post("/transfer", verifyJWT, transferAmount);

export default router;
