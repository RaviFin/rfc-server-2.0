import { Account } from "../models/account.js";
import { Transaction } from "../models/transaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Account
export const createAccount = asyncHandler(async (req, res) => {
  const { name, type, openingBalance, currency, isActive } = req.body;
  const account = await Account.create({
    name,
    currentBalance: openingBalance,
    type,
    openingBalance,
    currency,
    isActive,
  });
  res.status(201).json(new ApiResponse(201, account, "Account created"));
});

// List Accounts
export const listAccounts = asyncHandler(async (req, res) => {
  const accounts = await Account.find().sort({ createdAt: -1 });
  res.json(new ApiResponse(200, accounts, "Account list"));
});

// Get Account Details + Running Balance + Transactions
export const getAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const account = await Account.findById(id);
  if (!account) throw new ApiError(404, "Account not found");

  // Fetch all transactions for this account
  const transactions = await Transaction.find({ "entries.accountId": id }).sort(
    { date: -1 }
  );

  console.log("Transactions for account:", account.openingBalance);

  // Compute running balance from transactions (for audit/verification)
  let computedBalance = account.openingBalance;
  transactions.forEach((tx) => {
    tx.entries.forEach((entry) => {
      if (String(entry.accountId) === String(account._id)) {
        computedBalance += (entry.debit || 0) - (entry.credit || 0);
      }
    });
  });

  res.json(
    new ApiResponse(
      200,
      {
        account,
        currentBalance: account.currentBalance, // Live balance
        computedBalance, // Computed from transactions (for verification)
        transactions,
      },
      "Account details"
    )
  );
});

// Update Account
export const updateAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const account = await Account.findByIdAndUpdate(id, update, { new: true });
  if (!account) throw new ApiError(404, "Account not found");
  res.json(new ApiResponse(200, account, "Account updated"));
});

// Delete Account
export const deleteAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const account = await Account.findByIdAndDelete(id);
  if (!account) throw new ApiError(404, "Account not found");
  res.json(new ApiResponse(200, {}, "Account deleted"));
});
