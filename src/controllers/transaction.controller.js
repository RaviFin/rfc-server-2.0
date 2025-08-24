import mongoose from "mongoose";
import { Account } from "../models/account.js";
import { Customer } from "../models/customer.js";
import { Loan } from "../models/loan.js";
import { Transaction } from "../models/transaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createTransaction = asyncHandler(async (req, res) => {
  const {
    transactionType,
    amount,
    description,
    // Account related
    fromAccountId,
    toAccountId,
    accountId,
    // Customer/Loan related
    customerId,
    loanId,
    // Corporation/Interest specific
    corporationType, // "collect" or "distribute"
    principalType, // "collect" or "distribute"
  } = req.body;

  if (!transactionType || !amount) {
    throw new ApiError(400, "Transaction type and amount are required");
  }

  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      let transactionData;
      let updates = [];

      switch (transactionType) {
        case "corporation":
          await handleCorporationTransaction();
          break;
        case "interest":
          await handleInterestTransaction();
          break;
        case "principal":
          await handlePrincipalTransaction();
          break;
        case "transfer":
          await handleTransferTransaction();
          break;
        case "deposit":
          await handleDepositTransaction();
          break;
        case "withdrawal":
          await handleWithdrawalTransaction();
          break;
        default:
          throw new ApiError(400, "Invalid transaction type");
      }

      // Corporation Transaction Handler
      async function handleCorporationTransaction() {
        if (!customerId || !accountId) {
          throw new ApiError(
            400,
            "Customer ID and account ID are required for corporation transactions"
          );
        }

        // Add totalReceivable for distribute
        const { totalReceivable } = req.body;

        const customer = await Customer.findById(customerId).session(session);
        const account = await Account.findById(accountId).session(session);

        if (!customer) throw new ApiError(404, "Customer not found");
        if (!account) throw new ApiError(404, "Account not found");

        if (corporationType === "collect") {
          // Weekly corporation payment collection
          transactionData = {
            date: new Date(),
            type: "collect",
            collectKind: "corporation",
            relatedCustomer: customerId,
            remarks: description || "Corporation payment collection",
            createdBy: req.user._id,
            entries: [
              {
                ledger: "cash_bank", // Bank account increases
                accountId: accountId,
                customerId: customerId,
                debit: amount,
                credit: 0,
              },
              {
                ledger: "receivable_corporation", // Customer owes less
                customerId: customerId,
                debit: 0,
                credit: amount,
              },
            ],
          };

          updates.push({
            model: Account,
            id: accountId,
            update: { $inc: { currentBalance: amount } },
          });

          // Update customer corporation tracking for collection
          updates.push({
            model: Customer,
            id: customerId,
            update: {
              $inc: {
                corporationReceivable: -amount,
                totalCorporationReceived: amount,
              },
            },
          });
        } else if (corporationType === "distribute") {
          // Corporation amount given to customer
          if (!totalReceivable || totalReceivable <= amount) {
            throw new ApiError(
              400,
              "Total receivable amount must be greater than given amount"
            );
          }

          if (account.currentBalance < amount) {
            throw new ApiError(400, "Insufficient account balance");
          }

          const profit = totalReceivable - amount;

          transactionData = {
            date: new Date(),
            type: "give",
            collectKind: "corporation",
            relatedCustomer: customerId,
            remarks: description || "Corporation amount given to customer",
            createdBy: req.user._id,
            corporationAmount: amount,
            corporationTotal: totalReceivable,
            corporationProfit: profit,
            entries: [
              {
                ledger: "receivable_corporation", // Customer owes money (Asset ↑)
                customerId: customerId,
                debit: totalReceivable,
                credit: 0,
              },
              {
                ledger: "cash_bank", // Bank account decreases (Asset ↓)
                accountId: accountId,
                debit: 0,
                credit: amount,
              },
              {
                ledger: "income_corporation", // Corporation profit (Income ↑)
                customerId: customerId,
                debit: 0,
                credit: profit,
              },
            ],
          };

          updates.push({
            model: Account,
            id: accountId,
            update: { $inc: { currentBalance: -amount } },
          });

          // Update customer corporation tracking for distribution
          updates.push({
            model: Customer,
            id: customerId,
            update: {
              $inc: {
                corporationReceivable: totalReceivable,
                totalCorporationGiven: amount,
              },
            },
          });
        } else {
          throw new ApiError(
            400,
            "Corporation type must be 'collect' or 'distribute'"
          );
        }
      }

      // Interest Transaction Handler
      async function handleInterestTransaction() {
        if (!customerId || !accountId) {
          throw new ApiError(
            400,
            "Customer ID and account ID are required for interest transactions"
          );
        }

        const customer = await Customer.findById(customerId).session(session);
        const account = await Account.findById(accountId).session(session);

        if (!customer) throw new ApiError(404, "Customer not found");
        if (!account) throw new ApiError(404, "Account not found");

        transactionData = {
          date: new Date(),
          type: "collect",
          collectKind: "interest",
          relatedCustomer: customerId,
          remarks: description || "Interest collection",
          createdBy: req.user._id,
          entries: [
            {
              ledger: "cash_bank", // Bank account increases
              accountId: accountId,
              debit: amount,
              credit: 0,
            },
            {
              ledger: "income_interest", // Interest as income
              debit: 0,
              credit: amount,
            },
          ],
        };

        updates.push({
          model: Account,
          id: accountId,
          update: { $inc: { currentBalance: amount } },
        });
      }

      // Principal Transaction Handler
      async function handlePrincipalTransaction() {
        if (!loanId || !accountId) {
          throw new ApiError(
            400,
            "Loan ID and account ID are required for principal transactions"
          );
        }

        const loan = await Loan.findById(loanId).session(session);
        const account = await Account.findById(accountId).session(session);

        if (!loan) throw new ApiError(404, "Loan not found");
        if (!account) throw new ApiError(404, "Account not found");

        if (principalType === "collect") {
          // Collect principal repayment
          transactionData = {
            date: new Date(),
            type: "collect",
            collectKind: "principal",
            relatedLoan: loanId,
            relatedCustomer: loan.customerId,
            remarks: description || "Principal collection",
            createdBy: req.user._id,
            entries: [
              {
                ledger: "cash_bank", // Bank account increases
                accountId: accountId,
                debit: amount,
                credit: 0,
              },
              {
                ledger: "loan_principal", // Loan principal decreases
                loanId: loanId,
                debit: 0,
                credit: amount,
              },
            ],
          };

          updates.push({
            model: Account,
            id: accountId,
            update: { $inc: { currentBalance: amount } },
          });

          updates.push({
            model: Loan,
            id: loanId,
            update: {
              $inc: {
                principalOutstanding: -amount,
                totalReceivedPrincipal: amount,
              },
            },
          });
        } else if (principalType === "distribute") {
          // Distribute loan (disbursement)
          if (account.currentBalance < amount) {
            throw new ApiError(400, "Insufficient account balance");
          }

          transactionData = {
            date: new Date(),
            type: "give",
            collectKind: "principal",
            relatedLoan: loanId,
            relatedCustomer: loan.customerId,
            remarks: description || "Loan disbursement",
            createdBy: req.user._id,
            entries: [
              {
                ledger: "cash_bank", // Bank account decreases
                accountId: accountId,
                debit: 0,
                credit: amount,
              },
              {
                ledger: "loan_principal", // Loan principal increases
                loanId: loanId,
                debit: amount,
                credit: 0,
              },
            ],
          };

          updates.push({
            model: Account,
            id: accountId,
            update: { $inc: { currentBalance: -amount } },
          });

          updates.push({
            model: Loan,
            id: loanId,
            update: {
              $inc: {
                principalOutstanding: amount,
                totalDisbursed: amount,
              },
            },
          });
        } else {
          throw new ApiError(
            400,
            "Principal type must be 'collect' or 'distribute'"
          );
        }
      }

      // Transfer Transaction Handler
      async function handleTransferTransaction() {
        if (!fromAccountId || !toAccountId) {
          throw new ApiError(
            400,
            "From account and to account are required for transfers"
          );
        }

        const fromAccount = await Account.findById(fromAccountId).session(
          session
        );
        const toAccount = await Account.findById(toAccountId).session(session);

        if (!fromAccount) throw new ApiError(404, "Source account not found");
        if (!toAccount)
          throw new ApiError(404, "Destination account not found");

        if (fromAccount.currentBalance < amount) {
          throw new ApiError(400, "Insufficient balance in source account");
        }

        transactionData = {
          date: new Date(),
          type: "transfer",
          remarks: description || "Account transfer",
          createdBy: req.user._id,
          entries: [
            {
              ledger: "cash_bank", // From account decreases
              accountId: fromAccountId,
              debit: 0,
              credit: amount,
            },
            {
              ledger: "cash_bank", // To account increases
              accountId: toAccountId,
              debit: amount,
              credit: 0,
            },
          ],
        };

        updates.push({
          model: Account,
          id: fromAccountId,
          update: { $inc: { currentBalance: -amount } },
        });

        updates.push({
          model: Account,
          id: toAccountId,
          update: { $inc: { currentBalance: amount } },
        });
      }

      // Deposit Transaction Handler
      async function handleDepositTransaction() {
        if (!accountId) {
          throw new ApiError(400, "Account ID is required for deposits");
        }

        const account = await Account.findById(accountId).session(session);
        if (!account) throw new ApiError(404, "Account not found");

        transactionData = {
          date: new Date(),
          type: "deposit",
          remarks: description || "Capital deposit for business growth",
          createdBy: req.user._id,
          entries: [
            {
              ledger: "cash_bank", // Bank account increases (Asset ↑)
              accountId: accountId,
              debit: amount,
              credit: 0,
            },
            {
              ledger: "equity_capital", // Owner's capital increases (Equity ↑)
              debit: 0,
              credit: amount,
            },
          ],
        };

        updates.push({
          model: Account,
          id: accountId,
          update: { $inc: { currentBalance: amount } },
        });
      }

      // Withdrawal Transaction Handler
      async function handleWithdrawalTransaction() {
        if (!accountId) {
          throw new ApiError(400, "Account ID is required for withdrawals");
        }

        const account = await Account.findById(accountId).session(session);
        if (!account) throw new ApiError(404, "Account not found");

        if (account.currentBalance < amount) {
          throw new ApiError(400, "Insufficient account balance");
        }

        transactionData = {
          date: new Date(),
          type: "withdrawal",
          remarks: description || "Personal/operational withdrawal",
          createdBy: req.user._id,
          entries: [
            {
              ledger: "expense_personal", // Personal expense increases (Expense ↑)
              debit: amount,
              credit: 0,
            },
            {
              ledger: "cash_bank", // Bank account decreases (Asset ↓)
              accountId: accountId,
              debit: 0,
              credit: amount,
            },
          ],
        };

        updates.push({
          model: Account,
          id: accountId,
          update: { $inc: { currentBalance: -amount } },
        });
      }

      // Create transaction
      const transaction = await Transaction.create([transactionData], {
        session,
      });

      // Apply all updates
      for (const update of updates) {
        await update.model.findByIdAndUpdate(update.id, update.update, {
          session,
        });
      }

      res
        .status(201)
        .json(
          new ApiResponse(
            201,
            transaction[0],
            "Transaction completed successfully"
          )
        );
    });
  } catch (error) {
    throw new ApiError(500, "Transaction failed: " + error.message);
  } finally {
    await session.endSession();
  }
});

// Rest of your existing functions remain exactly the same...
// Get all transactions with pagination, filtering, and sorting
export const getAllTransactions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "date",
    sortOrder = "desc",
    type,
    collectKind,
    relatedCustomer,
    relatedLoan,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
  } = req.query;

  // Build filter object
  const filter = {};

  if (type) filter.type = type;
  if (collectKind) filter.collectKind = collectKind;
  if (relatedCustomer) filter.relatedCustomer = relatedCustomer;
  if (relatedLoan) filter.relatedLoan = relatedLoan;

  // Date range filter
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  // Amount range filter
  if (minAmount || maxAmount) {
    filter["entries.debit"] = {};
    if (minAmount) filter["entries.debit"].$gte = Number(minAmount);
    if (maxAmount) filter["entries.debit"].$lte = Number(maxAmount);
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Calculate pagination
  const pageNumber = parseInt(page);
  const limitNumber = parseInt(limit);
  const skip = (pageNumber - 1) * limitNumber;

  try {
    // Get transactions with population
    const transactions = await Transaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .populate("relatedCustomer", "name phone")
      .populate("relatedLoan", "loanNumber principalAmount")
      .populate("createdBy", "username fullName")
      .populate("entries.accountId", "accountNumber accountType currentBalance")
      .lean();

    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limitNumber);

    // Calculate totals for summary
    const summary = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: { $sum: "$entries.debit" } },
          totalCredit: { $sum: { $sum: "$entries.credit" } },
          transactionCount: { $sum: 1 },
        },
      },
    ]);

    const responseData = {
      transactions,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalTransactions,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
      summary: summary[0] || {
        totalDebit: 0,
        totalCredit: 0,
        transactionCount: 0,
      },
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          "Transactions retrieved successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Failed to retrieve transactions: " + error.message
    );
  }
});

// Get transaction by ID
export const getTransactionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid transaction ID");
  }

  try {
    const transaction = await Transaction.findById(id)
      .populate("relatedCustomer", "name phone address")
      .populate("relatedLoan", "loanNumber principalAmount interestRate status")
      .populate("createdBy", "username fullName")
      .populate(
        "entries.accountId",
        "accountNumber accountType currentBalance customerId"
      )
      .lean();

    if (!transaction) {
      throw new ApiError(404, "Transaction not found");
    }

    res
      .status(200)
      .json(
        new ApiResponse(200, transaction, "Transaction retrieved successfully")
      );
  } catch (error) {
    throw new ApiError(500, "Failed to retrieve transaction: " + error.message);
  }
});

// Get transactions by customer ID
export const getTransactionsByCustomer = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "date",
    sortOrder = "desc",
    type,
    collectKind,
  } = req.query;

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new ApiError(400, "Invalid customer ID");
  }

  // Build filter
  const filter = { relatedCustomer: customerId };
  if (type) filter.type = type;
  if (collectKind) filter.collectKind = collectKind;

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const pageNumber = parseInt(page);
  const limitNumber = parseInt(limit);
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const transactions = await Transaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .populate("relatedLoan", "loanNumber principalAmount")
      .populate("createdBy", "username")
      .populate("entries.accountId", "accountNumber accountType")
      .lean();

    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limitNumber);

    const responseData = {
      transactions,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalTransactions,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          "Customer transactions retrieved successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Failed to retrieve customer transactions: " + error.message
    );
  }
});

// Get transactions by loan ID
export const getTransactionsByLoan = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "date",
    sortOrder = "desc",
  } = req.query;

  if (!mongoose.Types.ObjectId.isValid(loanId)) {
    throw new ApiError(400, "Invalid loan ID");
  }

  // Build filter
  const filter = { relatedLoan: loanId };

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const pageNumber = parseInt(page);
  const limitNumber = parseInt(limit);
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const transactions = await Transaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .populate("relatedCustomer", "name phone")
      .populate("createdBy", "username")
      .populate("entries.accountId", "accountNumber accountType")
      .lean();

    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limitNumber);

    // Calculate loan payment summary
    const paymentSummary = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$collectKind",
          totalAmount: { $sum: { $sum: "$entries.debit" } },
          transactionCount: { $sum: 1 },
        },
      },
    ]);

    const responseData = {
      transactions,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalTransactions,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
      paymentSummary,
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          "Loan transactions retrieved successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Failed to retrieve loan transactions: " + error.message
    );
  }
});

// Get transactions by account ID
export const getTransactionsByAccount = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "date",
    sortOrder = "desc",
  } = req.query;

  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    throw new ApiError(400, "Invalid account ID");
  }

  // Build filter to find transactions that include this account
  const filter = { "entries.accountId": accountId };

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const pageNumber = parseInt(page);
  const limitNumber = parseInt(limit);
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const transactions = await Transaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .populate("relatedCustomer", "name phone")
      .populate("relatedLoan", "loanNumber")
      .populate("createdBy", "username")
      .populate("entries.accountId", "accountNumber accountType")
      .lean();

    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limitNumber);

    // Calculate account transaction summary
    const accountSummary = await Transaction.aggregate([
      { $match: filter },
      { $unwind: "$entries" },
      {
        $match: { "entries.accountId": new mongoose.Types.ObjectId(accountId) },
      },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: "$entries.debit" },
          totalCredit: { $sum: "$entries.credit" },
          transactionCount: { $sum: 1 },
        },
      },
    ]);

    const responseData = {
      transactions,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalTransactions,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
      accountSummary: accountSummary[0] || {
        totalDebit: 0,
        totalCredit: 0,
        transactionCount: 0,
      },
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          "Account transactions retrieved successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Failed to retrieve account transactions: " + error.message
    );
  }
});

// Update transaction (limited fields for audit trail)
export const updateTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { remarks, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid transaction ID");
  }

  try {
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      throw new ApiError(404, "Transaction not found");
    }

    // Only allow updating non-financial fields for audit compliance
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(remarks && { remarks }),
          ...(notes && { notes }),
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    )
      .populate("relatedCustomer", "name phone")
      .populate("relatedLoan", "loanNumber")
      .populate("createdBy", "username")
      .populate("updatedBy", "username");

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedTransaction,
          "Transaction updated successfully"
        )
      );
  } catch (error) {
    throw new ApiError(500, "Failed to update transaction: " + error.message);
  }
});

// Soft delete transaction (for audit trail)
export const deleteTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid transaction ID");
  }

  try {
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      throw new ApiError(404, "Transaction not found");
    }

    // Mark as deleted instead of hard delete for audit trail
    const deletedTransaction = await Transaction.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: true,
          deletedBy: req.user._id,
          deletedAt: new Date(),
        },
      },
      { new: true }
    );

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          deletedTransaction,
          "Transaction deleted successfully"
        )
      );
  } catch (error) {
    throw new ApiError(500, "Failed to delete transaction: " + error.message);
  }
});

// Get transaction statistics/reports
export const getTransactionStats = asyncHandler(async (req, res) => {
  const {
    dateFrom,
    dateTo,
    groupBy = "day", // day, week, month, year
    type,
    collectKind,
  } = req.query;

  try {
    // Build match stage
    const matchStage = {};

    if (dateFrom || dateTo) {
      matchStage.date = {};
      if (dateFrom) matchStage.date.$gte = new Date(dateFrom);
      if (dateTo) matchStage.date.$lte = new Date(dateTo);
    }

    if (type) matchStage.type = type;
    if (collectKind) matchStage.collectKind = collectKind;

    // Build group stage based on groupBy parameter
    let groupStage;
    switch (groupBy) {
      case "day":
        groupStage = {
          year: { $year: "$date" },
          month: { $month: "$date" },
          day: { $dayOfMonth: "$date" },
        };
        break;
      case "week":
        groupStage = {
          year: { $year: "$date" },
          week: { $week: "$date" },
        };
        break;
      case "month":
        groupStage = {
          year: { $year: "$date" },
          month: { $month: "$date" },
        };
        break;
      case "year":
        groupStage = {
          year: { $year: "$date" },
        };
        break;
      default:
        groupStage = {
          year: { $year: "$date" },
          month: { $month: "$date" },
          day: { $dayOfMonth: "$date" },
        };
    }

    const stats = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: groupStage,
          totalTransactions: { $sum: 1 },
          totalDebit: { $sum: { $sum: "$entries.debit" } },
          totalCredit: { $sum: { $sum: "$entries.credit" } },
          transactionTypes: {
            $push: {
              type: "$type",
              collectKind: "$collectKind",
              amount: { $sum: "$entries.debit" },
            },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    // Get overall summary
    const overallSummary = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalDebit: { $sum: { $sum: "$entries.debit" } },
          totalCredit: { $sum: { $sum: "$entries.credit" } },
          transactionsByType: {
            $push: {
              type: "$type",
              collectKind: "$collectKind",
            },
          },
        },
      },
    ]);

    // Get transaction type breakdown
    const typeBreakdown = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            type: "$type",
            collectKind: "$collectKind",
          },
          count: { $sum: 1 },
          totalAmount: { $sum: { $sum: "$entries.debit" } },
        },
      },
    ]);

    const responseData = {
      stats,
      overallSummary: overallSummary[0] || {
        totalTransactions: 0,
        totalDebit: 0,
        totalCredit: 0,
      },
      typeBreakdown,
      period: {
        from: dateFrom,
        to: dateTo,
        groupBy,
      },
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          "Transaction statistics retrieved successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Failed to retrieve transaction statistics: " + error.message
    );
  }
});
