import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = 5000;
const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectClient = await connectToMongoDB();
const db = connectClient.db("sport-nest");
const facilitiesCollection = db.collection("facilities");
const facilitiesBookingCollection = db.collection("facilitiesBooking");

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.FRONTEND_URI}/api/auth/jwks`),
);

// Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    // Better Auth's jwt() plugin sets both iss and aud to its baseURL by default
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.FRONTEND_URI,
      audience: process.env.FRONTEND_URI,
    });
    req.user = payload;
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  next();
};

app.post("/facilities", verifyToken, async (req, res) => {
  // Step-1: Retrieve the data from the request body
  const facilityData = req.body;

  //   Step-2: Insert the data into the MongoDB collection
  const result = await facilitiesCollection.insertOne(facilityData);

  //   Step-3: Send a response back to the client
  res.send(result);
});

app.get("/facilities", async (req, res) => {
  const result = await facilitiesCollection.find().toArray();
  res.send(result);
});

app.get("/my-facilities/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  //   if (email != req.user.email) {
  //     return res.status(403).send({ message: "Forbidden access" });
  //   }

  const result = await facilitiesCollection
    .find({ creatorEmail: email })
    .toArray();
  res.send(result);
});

app.get("/facilities/:id", async (req, res) => {
  const id = req.params.id;
  const result = await facilitiesCollection.findOne({ _id: new ObjectId(id) });

  res.send(result);
});

app.patch("/facilities/:id", async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;
  const result = await facilitiesCollection.updateOne(
    { _id: new ObjectId(id) }, // কাকে আপডেট করতে হবে তা নির্ধারণ করে
    { $set: updatedData }, // আপডেট করার জন্য নতুন ডেটা সেট করে
  );
  res.send(result);
});

app.delete("/facilities/:id", async (req, res) => {
  const id = req.params.id;
  const result = await facilitiesCollection.deleteOne({
    _id: new ObjectId(id),
  });
  res.send(result);
});

app.post("/facilities/booking", verifyToken, async (req, res) => {
  const bookingData = req.body;

  //   COndition
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
});

app.get("/facilities/booking/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  //   if (email != req.user.email) {
  //     return res.status(403).send({ message: "Forbidden access" });
  //   }

  const result = await facilitiesBookingCollection
    .find({ email: email })
    .toArray();
  res.send(result);
});

app.get("/", (req, res) => {
  res.send("Hello PH!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
