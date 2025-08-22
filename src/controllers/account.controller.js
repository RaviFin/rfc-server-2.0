import mongoose from "mongoose";
import { Account } from "../models/account.js";
import { Transaction } from "../models/transaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Account
export const createAccount = asyncHandler(async (req, res) => {
  const { name, type, openingBalance, currency, isActive } = req.body;

  // Fixed: Explicit validation and setting
  if (!name || !type || openingBalance === undefined) {
    throw new ApiError(400, "Name, type, and opening balance are required");
  }

  const account = await Account.create({
    name,
    type,
    openingBalance,
    currentBalance: openingBalance, // Explicitly set currentBalance
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

// Get Account Details
export const getAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid account ID");
  }

  const account = await Account.findById(id);
  if (!account) throw new ApiError(404, "Account not found");

  // Fetch all transactions for this account
  const transactions = await Transaction.find({ "entries.accountId": id }).sort(
    { date: -1 }
  );

  console.log("Account details:", {
    name: account.name,
    openingBalance: account.openingBalance,
    currentBalance: account.currentBalance,
  });

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
        currentBalance: account.currentBalance,
        computedBalance,
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

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid account ID");
  }

  const account = await Account.findByIdAndUpdate(id, update, { new: true });
  if (!account) throw new ApiError(404, "Account not found");
  res.json(new ApiResponse(200, account, "Account updated"));
});

// Delete Account
export const deleteAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid account ID");
  }

  const account = await Account.findByIdAndDelete(id);
  if (!account) throw new ApiError(404, "Account not found");
  res.json(new ApiResponse(200, {}, "Account deleted"));
});

// Add transfer functionality
export const transferAmount = asyncHandler(async (req, res) => {
  const { sourceAccountId, targetAccountId, amount, currency, remarks } =
    req.body;

  if (!sourceAccountId || !targetAccountId || !amount || amount <= 0) {
    throw new ApiError(400, "Invalid transfer details");
  }

  if (sourceAccountId === targetAccountId) {
    throw new ApiError(400, "Source and target accounts must be different");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [source, target] = await Promise.all([
      Account.findById(sourceAccountId).session(session),
      Account.findById(targetAccountId).session(session),
    ]);

    if (!source || !target) throw new ApiError(404, "Account not found");

    // Check sufficient balance
    if (source.currentBalance < amount) {
      throw new ApiError(
        400,
        `Insufficient balance. Available: ${source.currentBalance}, Required: ${amount}`
      );
    }

    // Update account balances
    source.currentBalance -= amount;
    target.currentBalance += amount;

    await Promise.all([source.save({ session }), target.save({ session })]);

    // Create transaction record
    await Transaction.create(
      [
        {
          date: new Date(),
          createdBy: req.user._id,
          type: "transfer",
          fromRef: { kind: "Account", id: sourceAccountId },
          toRef: { kind: "Account", id: targetAccountId },
          remarks: remarks || `Transfer from ${source.name} to ${target.name}`,
          entries: [
            {
              ledger: "cash_bank",
              accountId: sourceAccountId,
              debit: 0,
              credit: amount,
            },
            {
              ledger: "cash_bank",
              accountId: targetAccountId,
              debit: amount,
              credit: 0,
            },
          ],
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(
      new ApiResponse(
        201,
        {
          sourceAccount: { name: source.name, balance: source.currentBalance },
          targetAccount: { name: target.name, balance: target.currentBalance },
          amount,
          currency: currency || "INR",
        },
        "Transfer successful"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});
