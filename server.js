const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");

const app = express();

// ================= FIREBASE INIT =================
let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // important for Render env formatting
  serviceAccount.private_key =
    serviceAccount.private_key.replace(/\\n/g, "\n");

} catch (err) {
  console.error("Invalid FIREBASE_SERVICE_ACCOUNT");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.static("public"));

const XENDIT_SECRET = process.env.XENDIT_SECRET;

console.log("XENDIT SECRET EXISTS:", !!XENDIT_SECRET);
console.log("XENDIT SECRET PREFIX:", XENDIT_SECRET ? XENDIT_SECRET.slice(0, 16) : "NONE");
// ================= CREATE PAYMENT =================
app.post("/create-checkout", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).send("Missing userId");
    }

    const response = await axios.post(
      "https://api.xendit.co/v2/invoices",
      {
        external_id: "deegees_" + userId,
        amount: 49,
        description: "DGs Pattern Studio Premium Access",
        success_redirect_url: "https://deegees.onrender.com/success.html",
        failure_redirect_url: "https://deegees.onrender.com/unlockv2.html",
        metadata: {
          userId: userId
        }
      },
      {
         headers: {
             Authorization:
               "Basic " +
               Buffer.from(XENDIT_SECRET + ":").toString("base64"),
             "Content-Type": "application/json"
           }
        }
    );

    res.json({
      checkout_url: response.data.invoice_url
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Checkout error");
  }
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    if (event.status !== "PAID") {
      return res.sendStatus(200);
    }

    console.log("WEBHOOK BODY:", JSON.stringify(event, null, 2));

    const userId = event.external_id?.replace("deegees_", "");

     if (!userId) {
       console.log("Missing userId in webhook");
       return res.sendStatus(200);
    }

    const userRef = db.collection("users").doc(userId);

    const now = new Date();
const premiumUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

await userRef.set(
  {
    isPremium: true,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    premiumUntil: premiumUntil,
    paymentProvider: "xendit"
  },
  { merge: true }
);

    console.log("USER UNLOCKED:", userId);

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.sendStatus(200);
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
