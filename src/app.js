import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

//routes import
import accountRouter from "./routes/account.routes.js";
import customerRouter from "./routes/customer.routes.js";
import loanRouter from "./routes/loan.routes.js";
import transactionRouter from "./routes/transaction.routes.js";
import userRouter from "./routes/user.routes.js";

//routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/accounts", accountRouter);
app.use("/api/v1/transactions", transactionRouter);
app.use("/api/v1/loans", loanRouter);

export { app };
