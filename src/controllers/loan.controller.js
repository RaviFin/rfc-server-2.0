import mongoose from "mongoose";
import { Account } from "../models/account.js";
import { Customer } from "../models/customer.js";
import { Loan } from "../models/loan.js";
import { Transaction } from "../models/transaction.js";
import { User } from "../models/user.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Loan (with transaction)
export const createLoan = asyncHandler(async (req, res) => {
  const {
    loanName,
    type,
    loanTaker,
    loanDistributor,
    fromAccount,
    principal,
    amountDisbursed,
    disbursedAt,
    interestRateMonthly,
    interestCycle,
    repaymentMode,
    dueDayOfMonth,
    corporationPercent,
    termDays,
    weeklyPlanAmount,
  } = req.body;

  // Validate required fields
  if (
    !loanName ||
    !type ||
    !loanTaker ||
    !loanDistributor ||
    !fromAccount ||
    !principal ||
    !amountDisbursed
  ) {
    throw new ApiError(400, "All required fields must be provided");
  }

  // Validate ObjectIds
  if (!mongoose.Types.ObjectId.isValid(loanTaker)) {
    throw new ApiError(400, "Invalid loan taker ID");
  }
  if (!mongoose.Types.ObjectId.isValid(loanDistributor)) {
    throw new ApiError(400, "Invalid loan distributor ID");
  }
  if (!mongoose.Types.ObjectId.isValid(fromAccount)) {
    throw new ApiError(400, "Invalid account ID");
  }

  // Validate amounts
  if (principal <= 0 || amountDisbursed <= 0) {
    throw new ApiError(400, "Principal and disbursed amounts must be positive");
  }
  if (amountDisbursed > principal) {
    throw new ApiError(400, "Disbursed amount cannot exceed principal");
  }

  // Validate loan type specific fields
  if (type === "interest") {
    if (!interestRateMonthly || interestRateMonthly <= 0) {
      throw new ApiError(400, "Interest rate is required for interest loans");
    }
    if (!interestCycle) {
      throw new ApiError(400, "Interest cycle is required for interest loans");
    }
  } else if (type === "corporation") {
    if (!corporationPercent || corporationPercent <= 0) {
      throw new ApiError(
        400,
        "Corporation percent is required for corporation loans"
      );
    }
    if (!termDays || termDays <= 0) {
      throw new ApiError(400, "Term days is required for corporation loans");
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate that referenced entities exist
    const [customer, distributor, account] = await Promise.all([
      Customer.findById(loanTaker).session(session),
      User.findById(loanDistributor).session(session),
      Account.findById(fromAccount).session(session),
    ]);

    if (!customer) {
      throw new ApiError(404, "Loan taker (customer) not found");
    }
    if (!distributor) {
      throw new ApiError(404, "Loan distributor (user) not found");
    }
    if (!account) {
      throw new ApiError(404, "From account not found");
    }
    if (!account.isActive) {
      throw new ApiError(400, "Cannot disburse from inactive account");
    }

    // Check account balance
    if (account.currentBalance < amountDisbursed) {
      throw new ApiError(
        400,
        `Insufficient balance. Available: ${account.currentBalance}, Required: ${amountDisbursed}`
      );
    }

    // Create Loan
    const loan = await Loan.create(
      [
        {
          loanName,
          type,
          loanTaker,
          loanDistributor,
          fromAccount,
          principal,
          amountDisbursed,
          disbursedAt: disbursedAt || new Date(),
          interestRateMonthly,
          interestCycle,
          repaymentMode,
          dueDayOfMonth,
          corporationPercent,
          termDays,
          weeklyPlanAmount,
          principalOutstanding: principal,
          status: "active",
        },
      ],
      { session }
    );
    const loanDoc = loan[0];

    // Update account balance
    account.currentBalance -= amountDisbursed;
    await account.save({ session });

    // Create transaction entries
    const entries = [
      {
        ledger: "cash_bank",
        accountId: fromAccount,
        loanId: loanDoc._id,
        debit: 0,
        credit: amountDisbursed,
      },
      {
        ledger: "loan_principal",
        accountId: fromAccount,
        loanId: loanDoc._id,
        debit: principal,
        credit: 0,
      },
    ];

    // For corporation loans, handle discount
    if (type === "corporation" && principal > amountDisbursed) {
      entries.push({
        ledger: "income_corporation",
        accountId: fromAccount,
        loanId: loanDoc._id,
        debit: 0,
        credit: principal - amountDisbursed,
      });
    }

    await Transaction.create(
      [
        {
          date: disbursedAt || new Date(),
          createdBy: loanDistributor,
          type: "give",
          relatedLoan: loanDoc._id,
          relatedCustomer: loanTaker,
          fromRef: { kind: "Account", id: fromAccount },
          toRef: { kind: "Customer", id: loanTaker },
          remarks: `Loan disbursed: ${loanName}`,
          entries,
        },
      ],
      { session }
    );

    // Get populated loan data WITHIN transaction
    const populatedLoan = await Loan.findById(loanDoc._id)
      .populate("loanTaker", "name phone")
      .populate("loanDistributor", "name")
      .populate("fromAccount", "name type currentBalance")
      .session(session);

    await session.commitTransaction();
    session.endSession();

    res
      .status(201)
      .json(new ApiResponse(201, populatedLoan, "Loan created successfully"));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

// Collect Loan Payment
export const collectLoanPayment = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const { amount, kind, accountId, createdBy, date, remarks } = req.body;

  // Validate required fields
  if (!amount || amount <= 0) {
    throw new ApiError(400, "Valid amount is required");
  }
  if (
    !kind ||
    !["principal", "interest", "late_fee", "corporation"].includes(kind)
  ) {
    throw new ApiError(
      400,
      "Valid payment kind is required (principal, interest, late_fee, corporation)"
    );
  }
  if (!accountId) {
    throw new ApiError(400, "Account ID is required");
  }
  if (!createdBy) {
    throw new ApiError(400, "Created by user ID is required");
  }

  // Validate ObjectIds
  if (!mongoose.Types.ObjectId.isValid(loanId)) {
    throw new ApiError(400, "Invalid loan ID");
  }
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    throw new ApiError(400, "Invalid account ID");
  }
  if (!mongoose.Types.ObjectId.isValid(createdBy)) {
    throw new ApiError(400, "Invalid created by user ID");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate that entities exist
    const [loan, account, user] = await Promise.all([
      Loan.findById(loanId).session(session),
      Account.findById(accountId).session(session),
      User.findById(createdBy).session(session),
    ]);

    if (!loan) throw new ApiError(404, "Loan not found");
    if (!account) throw new ApiError(404, "Account not found");
    if (!user) throw new ApiError(404, "User not found");
    if (!account.isActive) {
      throw new ApiError(400, "Cannot collect payment to inactive account");
    }

    // Validation: Check payment limits
    if (kind === "principal" && amount > loan.principalOutstanding) {
      throw new ApiError(400, "Payment amount exceeds outstanding principal");
    }
    if (kind === "interest" && amount > (loan.interestAccruedUnpaid || 0)) {
      throw new ApiError(400, "Payment amount exceeds accrued interest");
    }

    // Create transaction entries based on payment kind
    const entries = [];
    if (kind === "principal") {
      entries.push(
        { ledger: "cash_bank", accountId, loanId, debit: amount, credit: 0 },
        {
          ledger: "loan_principal",
          accountId,
          loanId,
          debit: 0,
          credit: amount,
        }
      );
      loan.totalReceivedPrincipal = (loan.totalReceivedPrincipal || 0) + amount;
      loan.principalOutstanding -= amount;
    } else if (kind === "interest") {
      entries.push(
        { ledger: "cash_bank", accountId, loanId, debit: amount, credit: 0 },
        {
          ledger: "income_interest",
          accountId,
          loanId,
          debit: 0,
          credit: amount,
        }
      );
      loan.totalReceivedInterest = (loan.totalReceivedInterest || 0) + amount;
      loan.interestAccruedUnpaid = Math.max(
        0,
        (loan.interestAccruedUnpaid || 0) - amount
      );
    } else if (kind === "late_fee") {
      entries.push(
        { ledger: "cash_bank", accountId, loanId, debit: amount, credit: 0 },
        {
          ledger: "income_late_fee",
          accountId,
          loanId,
          debit: 0,
          credit: amount,
        }
      );
      loan.lateFeesAccrued = Math.max(0, (loan.lateFeesAccrued || 0) - amount);
    } else if (kind === "corporation") {
      entries.push(
        { ledger: "cash_bank", accountId, loanId, debit: amount, credit: 0 },
        {
          ledger: "income_corporation",
          accountId,
          loanId,
          debit: 0,
          credit: amount,
        }
      );
      loan.totalReceivedPrincipal = (loan.totalReceivedPrincipal || 0) + amount;
      loan.principalOutstanding -= amount;
    }

    // Update account balance
    account.currentBalance += amount;
    await account.save({ session });

    // Create transaction
    await Transaction.create(
      [
        {
          date: date || new Date(),
          createdBy,
          type: "collect",
          collectKind: kind,
          relatedLoan: loanId,
          relatedCustomer: loan.loanTaker,
          fromRef: { kind: "Customer", id: loan.loanTaker },
          toRef: { kind: "Account", id: accountId },
          remarks: remarks || `${kind} payment collected`,
          entries,
        },
      ],
      { session }
    );

    await loan.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json(
      new ApiResponse(
        200,
        {
          loan,
          accountBalance: account.currentBalance,
          message: `${kind} payment of ${amount} collected successfully`,
        },
        "Payment collected and loan updated"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

// List Loans
export const listLoans = asyncHandler(async (req, res) => {
  const { status, type, customer, page = 1, limit = 10, search } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (type) filter.type = type;
  if (customer) filter.loanTaker = customer;
  if (search) {
    filter.loanName = { $regex: search, $options: "i" };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Loan.countDocuments(filter);
  const loans = await Loan.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate("loanTaker", "name phone")
    .populate("loanDistributor", "name")
    .populate("fromAccount", "name type currentBalance");

  res.json(
    new ApiResponse(
      200,
      {
        loans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
      "Loan list"
    )
  );
});

// Get Loan Details
export const getLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid loan ID");
  }

  const loan = await Loan.findById(id)
    .populate("loanTaker", "name phone address")
    .populate("loanDistributor", "name email")
    .populate("fromAccount", "name type currentBalance");

  if (!loan) throw new ApiError(404, "Loan not found");

  // Get transactions for this loan
  const transactions = await Transaction.find({ relatedLoan: id })
    .sort({ date: -1 })
    .populate("createdBy", "name");

  // Compute stats
  const principalOutstanding = loan.principalOutstanding;
  const interestAccruedUnpaid = loan.interestAccruedUnpaid || 0;
  const totalReceivedPrincipal = loan.totalReceivedPrincipal || 0;
  const totalReceivedInterest = loan.totalReceivedInterest || 0;
  const lateFeesAccrued = loan.lateFeesAccrued || 0;

  // Calculate ROI
  const totalIncome =
    totalReceivedInterest +
    (loan.type === "corporation"
      ? (loan.corporationPercent || 0) * loan.principal
      : 0);
  const roi =
    loan.amountDisbursed > 0 ? (totalIncome / loan.amountDisbursed) * 100 : 0;

  // Calculate due amounts for interest loans
  let nextDueDate = null;
  let monthlyDue = 0;
  if (loan.type === "interest" && loan.status === "active") {
    const now = new Date();
    const disbursedDate = new Date(loan.disbursedAt);
    const monthsElapsed = Math.floor(
      (now - disbursedDate) / (1000 * 60 * 60 * 24 * 30)
    );
    monthlyDue = loan.principal * (loan.interestRateMonthly || 0);

    if (loan.dueDayOfMonth) {
      nextDueDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        loan.dueDayOfMonth
      );
      if (nextDueDate <= now) {
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      }
    }
  }

  res.json(
    new ApiResponse(
      200,
      {
        loan,
        transactions,
        stats: {
          principalOutstanding,
          interestAccruedUnpaid,
          totalReceivedPrincipal,
          totalReceivedInterest,
          lateFeesAccrued,
          roi: parseFloat(roi.toFixed(2)),
          monthlyDue,
          nextDueDate,
        },
      },
      "Loan details"
    )
  );
});

// Update Loan
export const updateLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid loan ID");
  }

  // Don't allow updating critical fields
  const restrictedFields = [
    "loanTaker",
    "loanDistributor",
    "fromAccount",
    "principal",
    "amountDisbursed",
    "disbursedAt",
  ];
  restrictedFields.forEach((field) => {
    if (update[field]) {
      delete update[field];
    }
  });

  const loan = await Loan.findByIdAndUpdate(id, update, { new: true })
    .populate("loanTaker", "name phone")
    .populate("loanDistributor", "name")
    .populate("fromAccount", "name type");

  if (!loan) throw new ApiError(404, "Loan not found");
  res.json(new ApiResponse(200, loan, "Loan updated"));
});

// Close Loan
export const closeLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid loan ID");
  }

  const loan = await Loan.findById(id);
  if (!loan) throw new ApiError(404, "Loan not found");

  if (loan.status === "closed") {
    throw new ApiError(400, "Loan is already closed");
  }
  if (loan.status === "defaulted") {
    throw new ApiError(400, "Cannot close a defaulted loan");
  }
  if (loan.principalOutstanding > 0) {
    throw new ApiError(
      400,
      "Loan cannot be closed, outstanding principal remains"
    );
  }

  loan.status = "closed";
  loan.closedAt = new Date();
  await loan.save();

  res.json(new ApiResponse(200, loan, "Loan closed successfully"));
});

// Default Loan
export const defaultLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid loan ID");
  }

  const loan = await Loan.findById(id);
  if (!loan) throw new ApiError(404, "Loan not found");

  if (loan.status === "closed") {
    throw new ApiError(400, "Cannot default a closed loan");
  }
  if (loan.status === "defaulted") {
    throw new ApiError(400, "Loan is already marked as defaulted");
  }

  loan.status = "defaulted";
  loan.defaultedAt = new Date();
  await loan.save();

  res.json(new ApiResponse(200, loan, "Loan marked as defaulted"));
});

// Get Loan Summary (Dashboard)
export const getLoanSummary = asyncHandler(async (req, res) => {
  const summary = await Loan.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalPrincipal: { $sum: "$principal" },
        totalDisbursed: { $sum: "$amountDisbursed" },
        totalOutstanding: { $sum: "$principalOutstanding" },
        totalReceived: { $sum: "$totalReceivedPrincipal" },
      },
    },
  ]);

  const typeWiseSummary = await Loan.aggregate([
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        totalPrincipal: { $sum: "$principal" },
        totalDisbursed: { $sum: "$amountDisbursed" },
        totalOutstanding: { $sum: "$principalOutstanding" },
      },
    },
  ]);

  res.json(
    new ApiResponse(
      200,
      {
        statusWise: summary,
        typeWise: typeWiseSummary,
      },
      "Loan summary"
    )
  );
});

// Delete Loan (Admin only)
export const deleteLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid loan ID");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findById(id).session(session);
    if (!loan) throw new ApiError(404, "Loan not found");

    if (loan.status === "active" && loan.principalOutstanding > 0) {
      throw new ApiError(
        400,
        "Cannot delete an active loan with outstanding balance"
      );
    }

    // Delete related transactions
    await Transaction.deleteMany({ relatedLoan: id }).session(session);

    // Delete the loan
    await Loan.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json(new ApiResponse(200, {}, "Loan and related transactions deleted"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});
