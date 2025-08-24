import mongoose, { Schema, Types } from "mongoose";

const entrySchema = new Schema(
  {
    ledger: {
      type: String,
      enum: [
        // Asset Accounts
        "cash_bank", // Bank/Cash accounts
        "loan_principal", // Loan receivables
        "interest_receivable", // Interest due from customers
        "income_interest", // Interest income earned
        "income_corporation", // Corporation profit income
        "income_late_fee", // Late payment fees income
        "receivable_corporation", // Corporation amounts due from customers
        "expense_personal", // Personal withdrawals
        "expense_operational", // Business expenses
        "equity_capital", // Owner's investment/capital
      ],
      required: true,
    },
    accountId: { type: Types.ObjectId, ref: "Account" },
    loanId: { type: Types.ObjectId, ref: "Loan" },
    customerId: { type: Types.ObjectId, ref: "Customer" }, // Add this for corporation tracking
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
  },
  { _id: false }
);

const transactionSchema = new Schema(
  {
    date: { type: Date, required: true },
    createdBy: { type: Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["give", "collect", "adjust", "transfer", "deposit", "withdrawal"], // Add deposit, withdrawal
      required: true,
    },
    collectKind: {
      type: String,
      enum: ["interest", "corporation", "principal", "late_fee"],
    },
    relatedLoan: { type: Types.ObjectId, ref: "Loan" },
    relatedCustomer: { type: Types.ObjectId, ref: "Customer" },
    fromRef: {
      kind: String,
      id: { type: Types.ObjectId },
    },
    toRef: {
      kind: String,
      id: { type: Types.ObjectId },
    },
    remarks: { type: String },
    entries: {
      type: [entrySchema],
      validate: (v) => Array.isArray(v) && v.length >= 2,
    },
    // Add audit fields
    isDeleted: { type: Boolean, default: false },
    deletedBy: { type: Types.ObjectId, ref: "User" },
    deletedAt: { type: Date },
    updatedBy: { type: Types.ObjectId, ref: "User" },
    notes: { type: String },

    // Corporation specific fields
    corporationAmount: { type: Number }, // Amount given to customer
    corporationTotal: { type: Number }, // Total customer will pay back
    corporationProfit: { type: Number }, // Calculated profit
  },
  { timestamps: true }
);

transactionSchema.index({ date: 1 });
transactionSchema.index({ relatedLoan: 1 });
transactionSchema.index({ relatedCustomer: 1 });
transactionSchema.index({ type: 1, collectKind: 1 });
transactionSchema.index({ isDeleted: 1 });

export const Transaction = mongoose.model("Transaction", transactionSchema);
