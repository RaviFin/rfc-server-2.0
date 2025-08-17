import express from "express";
const app = express();

import dotenv from "dotenv";
import connectDB from "./db/index.js";

dotenv.config({
  path: "./.env",
});

connectDB();
