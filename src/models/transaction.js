import mongoose, { Schema, Types } from "mongoose";

const entrySchema = new Schema(
  {
    ledger: {
      type: String,
      enum: [
        "cash_bank",
        "loan_principal",
        "interest_receivable",
        "income_interest",
        "income_corporation",
        "income_late_fee",
        "receivable_corporation",
      ],
      required: true,
    },
    accountId: { type: Types.ObjectId, ref: "Account" },
    loanId: { type: Types.ObjectId, ref: "Loan" },
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
      enum: ["give", "collect", "adjust", "transfer"],
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
  },
  { timestamps: true }
);

transactionSchema.index({ date: 1 });
transactionSchema.index({ relatedLoan: 1 });

export const Transaction = mongoose.model("Transaction", transactionSchema);
