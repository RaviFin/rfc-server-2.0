import mongoose, { Schema } from "mongoose";

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String },

    // Corporation tracking
    corporationReceivable: { type: Number, default: 0 }, // How much customer owes
    totalCorporationGiven: { type: Number, default: 0 }, // Total amount given
    totalCorporationReceived: { type: Number, default: 0 }, // Total received back
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ createdBy: 1 });

export const Customer = mongoose.model("Customer", customerSchema);
