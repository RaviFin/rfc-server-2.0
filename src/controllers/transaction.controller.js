import mongoose from "mongoose";
import { Transaction } from "../models/transaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Transaction
export const createTransaction = asyncHandler(async (req, res) => {
  const txData = req.body;
  // Validate minimum entries
  if (!txData.entries || txData.entries.length < 2) {
    throw new ApiError(400, "At least two entries required for double-entry");
  }
  const transaction = await Transaction.create(txData);
  res
    .status(201)
    .json(new ApiResponse(201, transaction, "Transaction created"));
});

// List Transactions (with optional filters)
export const listTransactions = asyncHandler(async (req, res) => {
  const { loanId, customerId, accountId, type, from, to } = req.query;
  const filter = {};
  if (loanId) filter.relatedLoan = loanId;
  if (customerId) filter.relatedCustomer = customerId;
  if (type) filter.type = type;
  if (from) filter.date = { ...filter.date, $gte: new Date(from) };
  if (to) filter.date = { ...filter.date, $lte: new Date(to) };
  if (accountId) filter["entries.accountId"] = accountId;
  const transactions = await Transaction.find(filter).sort({ date: -1 });
  res.json(new ApiResponse(200, transactions, "Transaction list"));
});

// Get Transaction by ID
export const getTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ApiError(400, "Invalid ID");
  const transaction = await Transaction.findById(id);
  if (!transaction) throw new ApiError(404, "Transaction not found");
  res.json(new ApiResponse(200, transaction, "Transaction details"));
});

// Update Transaction
export const updateTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const transaction = await Transaction.findByIdAndUpdate(id, update, {
    new: true,
  });
  if (!transaction) throw new ApiError(404, "Transaction not found");
  res.json(new ApiResponse(200, transaction, "Transaction updated"));
});

// Delete Transaction
export const deleteTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transaction = await Transaction.findByIdAndDelete(id);
  if (!transaction) throw new ApiError(404, "Transaction not found");
  res.json(new ApiResponse(200, {}, "Transaction deleted"));
});
