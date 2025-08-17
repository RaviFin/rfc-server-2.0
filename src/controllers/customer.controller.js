import mongoose from "mongoose";
import { Customer } from "../models/customer.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Create Customer
export const createCustomer = asyncHandler(async (req, res) => {
  const { name, phone, address, notes } = req.body;
  const createdBy = req.user._id;

  const customer = await Customer.create({
    name,
    phone,
    address,
    notes,
    createdBy,
  });
  res.status(201).json(new ApiResponse(201, customer, "Customer created"));
});

// List/Search Customers
export const listCustomers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = search ? { name: { $regex: search, $options: "i" } } : {};
  const customers = await Customer.find(query).sort({ createdAt: -1 });
  res.json(new ApiResponse(200, customers, "Customer list"));
});

// Get Customer Rich View

export const getCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Use aggregation for better performance
  const result = await Customer.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: "loans",
        localField: "_id",
        foreignField: "loanTaker",
        as: "loans",
      },
    },
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "relatedCustomer",
        as: "transactions",
      },
    },
    {
      $addFields: {
        totalPrincipalOutstanding: { $sum: "$loans.principalOutstanding" },
        totalInterestDue: { $sum: "$loans.interestAccruedUnpaid" },
        totalOverdue: { $sum: "$loans.lateFeesAccrued" },
        totalAmountDisbursed: { $sum: "$loans.amountDisbursed" },
        totalReceivedInterest: { $sum: "$loans.totalReceivedInterest" },
      },
    },
    {
      $addFields: {
        roi: {
          $cond: {
            if: { $gt: ["$totalAmountDisbursed", 0] },
            then: {
              $divide: ["$totalReceivedInterest", "$totalAmountDisbursed"],
            },
            else: 0,
          },
        },
      },
    },
  ]);

  if (!result.length) throw new ApiError(404, "Customer not found");

  const customerData = result[0];
  res.json(
    new ApiResponse(
      200,
      {
        customer: {
          _id: customerData._id,
          name: customerData.name,
          phone: customerData.phone,
          address: customerData.address,
          createdBy: customerData.createdBy,
          notes: customerData.notes,
          createdAt: customerData.createdAt,
          updatedAt: customerData.updatedAt,
        },
        loans: customerData.loans,
        transactions: customerData.transactions,
        computed: {
          totalPrincipalOutstanding: customerData.totalPrincipalOutstanding,
          totalInterestDue: customerData.totalInterestDue,
          totalOverdue: customerData.totalOverdue,
          roi: customerData.roi,
        },
      },
      "Customer details"
    )
  );
});

// Update Customer
export const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const customer = await Customer.findByIdAndUpdate(id, update, { new: true });
  if (!customer) throw new ApiError(404, "Customer not found");
  res.json(new ApiResponse(200, customer, "Customer updated"));
});

// Delete Customer
export const deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customer = await Customer.findByIdAndDelete(id);
  if (!customer) throw new ApiError(404, "Customer not found");
  res.json(new ApiResponse(200, {}, "Customer deleted"));
});
