import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  try {
    // Attempting to connect to the MongoDB database
    const connectionInstance =
      await mongoose.connect(`${process.env.MONGODB_URI}/
          ${DB_NAME}`);

    // If the connection is successful, log a success message
    console.log(
      `\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MongoDB connecting error", error);
    process.exit(1); // Exit the process with a failure status code (1)
  }
};

export default connectDB;
