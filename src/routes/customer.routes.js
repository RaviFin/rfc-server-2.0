import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../controllers/customer.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/", verifyJWT, createCustomer);
router.get("/", verifyJWT, listCustomers);
router.get("/:id", verifyJWT, getCustomer);
router.patch("/:id", verifyJWT, updateCustomer);
router.delete("/:id", verifyJWT, deleteCustomer);

export default router;
