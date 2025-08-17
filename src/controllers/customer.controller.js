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
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new ApiError(400, "Invalid ID");

  const customer = await Customer.findById(id);
  if (!customer) throw new ApiError(404, "Customer not found");

  // TODO: Fetch loans and transactions for this customer
  // const loans = await Loan.find({ customer: id });
  // const transactions = await Transaction.find({ customer: id });

  // TODO: Compute totals and ROI

  res.json(
    new ApiResponse(
      200,
      { customer /*, loans, transactions, computed */ },
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
