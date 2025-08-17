import mongoose, { Schema } from "mongoose";

const accountSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["cash", "bank"], required: true },
    openingBalance: { type: Number, required: true }, // paise
    currentBalance: { type: Number, default: 0 },

    currency: { type: String, default: "INR" },
    isActive: { type: Boolean, default: true },
    // cachedBalance: { type: Number }, // optional, not used for audit
  },
  { timestamps: true }
);
accountSchema.pre("save", function (next) {
  if (this.isNew && this.currentBalance === undefined) {
    this.currentBalance = this.openingBalance;
  }
  next();
});

export const Account = mongoose.model("Account", accountSchema);
