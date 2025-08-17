import mongoose, { Schema } from "mongoose";

const loanSchema = new Schema(
  {
    loanName: { type: String, required: true, trim: true },
    type: { type: String, enum: ["interest", "corporation"], required: true },
    loanTaker: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    loanDistributor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fromAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "closed", "defaulted", "written_off"],
      default: "active",
    },

    principal: { type: Number, required: true }, // Face value
    amountDisbursed: { type: Number, required: true }, // Actual cash given
    disbursedAt: { type: Date, required: true },

    // INTEREST loan fields
    interestRateMonthly: { type: Number }, // e.g., 0.02 for 2%
    interestCycle: {
      type: String,
      enum: ["monthly", "quarterly", "yearly", "on_close"],
    },
    repaymentMode: { type: String, enum: ["interest_only", "emi", "bullet"] },
    dueDayOfMonth: { type: Number },
    nextDueDate: { type: Date },

    // CORPORATION loan fields
    corporationPercent: { type: Number },
    termDays: { type: Number },
    weeklyPlanAmount: { type: Number },

    // Tracking fields
    principalOutstanding: { type: Number, default: 0 },
    interestAccruedUnpaid: { type: Number, default: 0 },
    totalReceivedPrincipal: { type: Number, default: 0 },
    totalReceivedInterest: { type: Number, default: 0 },
    lateFeesAccrued: { type: Number, default: 0 },
    closedAt: { type: Date },

    // Computed/cached fields can be added as needed
  },
  {
    timestamps: true,
  }
);

loanSchema.index({ loanTaker: 1, status: 1, type: 1 });

export const Loan = mongoose.model("Loan", loanSchema);
