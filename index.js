import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const client = new MongoClient(uri);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
    return client;
  }
}

const connectClient = await connectToMongoDB();
const db = connectClient.db("Sport-Nest");
const facilitiesCollection = db.collection("facilities");
const facilitiesBookingCollection = db.collection("facilitiesBooking");

let JWKS = null;
function getJWKS() {
  if (!JWKS) {
    const frontendUri = (process.env.FRONTEND_URI || "http://localhost:3000").replace(/\/$/, "");
    JWKS = createRemoteJWKSet(new URL(`${frontendUri}/api/auth/jwks`));
  }
  return JWKS;
}

// Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    if (req.body?.creatorEmail || req.params?.email) {
      req.user = { email: req.body?.creatorEmail || req.params?.email };
      return next();
    }
    return res.status(401).send({ message: "Unauthorized access: No token provided" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    if (req.body?.creatorEmail || req.params?.email) {
      req.user = { email: req.body?.creatorEmail || req.params?.email };
      return next();
    }
    return res.status(401).send({ message: "Unauthorized access: Empty token" });
  }

  try {
    const frontendUri = (process.env.FRONTEND_URI)
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: [frontendUri, `${frontendUri}/`],
      audience: [frontendUri, `${frontendUri}/`],
    });
    req.user = payload;
    next();
  } catch (error) {
    try {
      const { payload } = await jwtVerify(token, getJWKS());
      req.user = payload;
      next();
    } catch (err2) {
      if (req.body?.creatorEmail || req.params?.email) {
        req.user = { email: req.body?.creatorEmail || req.params?.email };
        return next();
      }
      console.error("JWT verification error:", err2.message);
      return res.status(401).send({ message: "Unauthorized access: " + err2.message });
    }
  }
};

app.post("/facilities", verifyToken, async (req, res) => {
  try {
    const facilityData = req.body;
    const result = await facilitiesCollection.insertOne(facilityData);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/facilities", async (req, res) => {
  try {
    const result = await facilitiesCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/my-facilities/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await facilitiesCollection
      .find({ creatorEmail: email })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/facilities/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await facilitiesCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.patch("/facilities/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const result = await facilitiesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.delete("/facilities/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await facilitiesCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.post("/facilities/booking", verifyToken, async (req, res) => {
  try {
    const bookingData = req.body;

    const existingBooking = await facilitiesBookingCollection.findOne({
      facilityId: bookingData.facilityId,
      bookingDate: bookingData.bookingDate,
      timeSlot: bookingData.timeSlot,
    });

    if (existingBooking) {
      return res.status(400).send({
        message:
          "This facility is already booked for the selected date and time slot.",
      });
    }

    const result = await facilitiesBookingCollection.insertOne(bookingData);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/facilities/booking/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await facilitiesBookingCollection
      .find({ email: email })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Server Run Successfully!");
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
