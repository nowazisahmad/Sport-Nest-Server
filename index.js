import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

// Cached MongoDB client & database for serverless execution
let client = null;
let db = null;

export async function connectToMongoDB() {
  if (db) return db;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI environment variable is missing!");
    return null;
  }

  try {
    if (!client) {
      client = new MongoClient(uri);
    }
    await client.connect();
    console.log("Successfully connected to MongoDB!");
    db = client.db("sport-nest");
    return db;
  } catch (err) {
    console.error("MongoDB connection error:", err);
    return null;
  }
}

// Lazy JWKS initialization to prevent startup crashes when FRONTEND_URI is not set
let JWKS = null;
function getJWKS() {
  if (!JWKS) {
    const frontendUri = process.env.FRONTEND_URI || "http://localhost:3000";
    JWKS = createRemoteJWKSet(new URL(`${frontendUri}/api/auth/jwks`));
  }
  return JWKS;
}

// Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access: No token provided" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access: Empty token" });
  }

  try {
    const frontendUri = process.env.FRONTEND_URI || "http://localhost:3000";
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: frontendUri,
      audience: frontendUri,
    });
    req.user = payload;
    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    return res.status(401).send({ message: "Unauthorized access: Invalid token" });
  }
};

// Root health check endpoint - always returns immediately
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "SportNest Server is running!",
    timestamp: new Date().toISOString(),
  });
});

app.post("/facilities", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const facilityData = req.body;
    const result = await database.collection("facilities").insertOne(facilityData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/facilities", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const result = await database.collection("facilities").find().toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/my-facilities/:email", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const email = req.params.email;
    const result = await database
      .collection("facilities")
      .find({ creatorEmail: email })
      .toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/facilities/:id", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const id = req.params.id;
    const result = await database
      .collection("facilities")
      .findOne({ _id: new ObjectId(id) });
    if (!result) {
      return res.status(404).json({ message: "Facility not found" });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.patch("/facilities/:id", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const id = req.params.id;
    const updatedData = req.body;
    const result = await database.collection("facilities").updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/facilities/:id", async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const id = req.params.id;
    const result = await database.collection("facilities").deleteOne({
      _id: new ObjectId(id),
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/facilities/booking", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const bookingData = req.body;
    const facilitiesBookingCollection = database.collection("facilitiesBooking");

    const existingBooking = await facilitiesBookingCollection.findOne({
      facilityId: bookingData.facilityId,
      bookingDate: bookingData.bookingDate,
      timeSlot: bookingData.timeSlot,
    });

    if (existingBooking) {
      return res.status(400).json({
        message:
          "This facility is already booked for the selected date and time slot.",
      });
    }

    const result = await facilitiesBookingCollection.insertOne(bookingData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/facilities/booking/:email", verifyToken, async (req, res) => {
  try {
    const database = await connectToMongoDB();
    if (!database) {
      return res.status(500).json({ message: "Database connection unavailable" });
    }
    const email = req.params.email;
    const result = await database
      .collection("facilitiesBooking")
      .find({ email: email })
      .toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Start local listener only if not running in Vercel serverless environment
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Crucial for Vercel Serverless Function deployment!
export default app;
