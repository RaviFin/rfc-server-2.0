// Create Loan (with transaction)
import mongoose from "mongoose";
import { Account } from "../models/account.js";
import { Customer } from "../models/customer.js";
import { Loan } from "../models/loan.js";
import { Transaction } from "../models/transaction.js";
import { User } from "../models/user.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Loan (with validation and transaction)
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
        },
      ],
      { session }
    );
    const loanDoc = loan[0];

    // Create Transaction for disbursement
    const entries = [
      // Reduce cash/bank
      {
        ledger: "cash_bank",
        accountId: fromAccount,
        loanId: loanDoc._id,
        debit: 0,
        credit: amountDisbursed,
      },
      // Increase loan principal
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

    await session.commitTransaction();
    session.endSession();

    // Populate the response with actual entity details
    const populatedLoan = await Loan.findById(loanDoc._id)
      .populate("loanTaker", "name phone")
      .populate("loanDistributor", "name")
      .populate("fromAccount", "name type");

    res
      .status(201)
      .json(new ApiResponse(201, populatedLoan, "Loan created successfully"));
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

// Enhanced validation for collectLoanPayment as well
export const collectLoanPayment = asyncHandler(async (req, res) => {
  const { loanId } = req.params;
  const { amount, kind, accountId, createdBy, date, remarks } = req.body;

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

  // Input validation
  if (!amount || amount <= 0) {
    throw new ApiError(400, "Valid amount is required");
  }
  if (!["principal", "interest", "late_fee", "corporation"].includes(kind)) {
    throw new ApiError(400, "Invalid payment kind");
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

    // Validation: Check if payment amount doesn't exceed outstanding
    if (kind === "principal" && amount > loan.principalOutstanding) {
      throw new ApiError(400, "Payment amount exceeds outstanding principal");
    }
    if (kind === "interest" && amount > loan.interestAccruedUnpaid) {
      throw new ApiError(400, "Payment amount exceeds accrued interest");
    }

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
      loan.totalReceivedPrincipal += amount;
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
      loan.totalReceivedInterest += amount;
      loan.interestAccruedUnpaid = Math.max(
        0,
        loan.interestAccruedUnpaid - amount
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
      loan.lateFeesAccrued = Math.max(0, loan.lateFeesAccrued - amount);
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
      loan.totalReceivedPrincipal += amount;
      loan.principalOutstanding -= amount;
    }

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
          remarks,
          entries,
        },
      ],
      { session }
    );

    await loan.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json(new ApiResponse(200, loan, "Payment collected and loan updated"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

// ...existing code for other functions (listLoans, getLoan, updateLoan, closeLoan, defaultLoan)

// List Loans
export const listLoans = asyncHandler(async (req, res) => {
  const { status, type, customer, page = 1, limit = 10 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (customer) filter.loanTaker = customer;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Loan.countDocuments(filter);
  const loans = await Loan.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate("loanTaker", "name phone")
    .populate("loanDistributor", "name")
    .populate("fromAccount", "name type");

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
  const loan = await Loan.findById(id).populate(
    "loanTaker loanDistributor fromAccount"
  );
  if (!loan) throw new ApiError(404, "Loan not found");

  // Get transactions for this loan
  const transactions = await Transaction.find({ relatedLoan: id }).sort({
    date: 1,
  });

  // Compute stats
  const principalOutstanding = loan.principalOutstanding;
  const interestAccruedUnpaid = loan.interestAccruedUnpaid;
  const totalReceivedPrincipal = loan.totalReceivedPrincipal;
  const totalReceivedInterest = loan.totalReceivedInterest;
  const roi =
    loan.amountDisbursed > 0
      ? (totalReceivedInterest +
          (loan.corporationPercent || 0) * loan.amountDisbursed) /
        loan.amountDisbursed
      : 0;

  res.json(
    new ApiResponse(
      200,
      {
        loan,
        transactions,
        principalOutstanding,
        interestAccruedUnpaid,
        totalReceivedPrincipal,
        totalReceivedInterest,
        roi,
      },
      "Loan details"
    )
  );
});
// Update Loan
export const updateLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const loan = await Loan.findByIdAndUpdate(id, update, { new: true });
  if (!loan) throw new ApiError(404, "Loan not found");
  res.json(new ApiResponse(200, loan, "Loan updated"));
});

// Close Loan
export const closeLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const loan = await Loan.findById(id);
  if (!loan) throw new ApiError(404, "Loan not found");
  if (loan.principalOutstanding > 0) {
    throw new ApiError(
      400,
      "Loan cannot be closed, outstanding principal remains"
    );
  }
  loan.status = "closed";
  loan.closedAt = new Date();
  await loan.save();
  res.json(new ApiResponse(200, loan, "Loan closed"));
});

// Default Loan
export const defaultLoan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const loan = await Loan.findById(id);
  if (!loan) throw new ApiError(404, "Loan not found");
  loan.status = "defaulted";
  await loan.save();
  res.json(new ApiResponse(200, loan, "Loan marked as defaulted"));
});
