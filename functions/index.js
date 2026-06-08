/* eslint-disable */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { z } = require("zod");
const stripe = require("stripe")(functions.config().stripe?.secret_key || "sk_test_mock");
const express = require("express");
const cors = require("cors");

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().gmail?.email || 'dummy@gmail.com',
    pass: functions.config().gmail?.password || 'dummy',
  },
});

const emailSchema = z.object({
  email: z.string().email("Invalid email address format"),
});

const globalRegion = functions.region('us-central1', 'europe-west1', 'asia-northeast1');

exports.sendOtpEmail = globalRegion.https.onCall(async (data, context) => {
  const parseResult = emailSchema.safeParse(data);
  if (!parseResult.success) throw new functions.https.HttpsError("invalid-argument", parseResult.error.errors[0].message);
  
  const targetEmail = parseResult.data.email;
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  await admin.firestore().collection("OTP_Verifications").doc(targetEmail).set({
    otp: otpCode,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  const mailOptions = {
    from: '"ADK Software Solutions" <adkcom2114@gmail.com>',
    to: targetEmail,
    subject: "Your ADK Smart POS Verification Code",
    html: `<h1>${otpCode}</h1>`
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
});

// ==========================================
// SUBSCRIPTION & ADMIN ARCHITECTURE (PHASE 6)
// ==========================================

// Middleware to verify Super Admin status
const verifyAdmin = async (req, res, next) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin.firestore().collection('Users').doc(decodedToken.uid).get();
    
    // arikarran14@gmail.com is hardcoded as Super Admin
    if (userDoc.data()?.role === 'admin' || decodedToken.email === 'arikarran14@gmail.com') {
      req.user = decodedToken;
      next();
    } else {
      res.status(403).send({ error: 'Forbidden: Admin access required' });
    }
  } catch (error) {
    res.status(401).send({ error: 'Unauthorized' });
  }
};

const app = express();
app.use(cors({ origin: true }));

// Admin Route: Get all users
app.get('/listUsers', verifyAdmin, async (req, res) => {
  try {
    const usersSnapshot = await admin.firestore().collection('Users').get();
    const users = [];
    usersSnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const toggleTierSchema = z.object({
  targetUserId: z.string().min(1, "Target User ID is required"),
  newRole: z.enum(['normal', 'premium', 'admin'], {
    errorMap: () => ({ message: "Invalid role value. Must be 'normal', 'premium', or 'admin'" })
  })
});

const forceResetSchema = z.object({
  email: z.string().email("Invalid target email address format")
});

// Admin Route: Toggle Premium Tier manually
app.post('/toggleTier', verifyAdmin, async (req, res) => {
  const parseResult = toggleTierSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { targetUserId, newRole } = parseResult.data;
  
  try {
    await admin.firestore().collection('Users').doc(targetUserId).update({
      role: newRole,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: `User updated to ${newRole}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Route: Force Password Reset trigger
app.post('/forcePasswordReset', verifyAdmin, async (req, res) => {
  const parseResult = forceResetSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0].message });
  }

  const { email } = parseResult.data;
  try {
    const link = await admin.auth().generatePasswordResetLink(email);
    res.json({ success: true, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export the Admin API
exports.adminApi = globalRegion.https.onRequest(app);

// Stripe Checkout Session Creation
exports.createCheckoutSession = globalRegion.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{
      price: 'price_1MockPremiumTierPrice', // Replace with real Stripe Price ID
      quantity: 1,
    }],
    success_url: 'https://adk-pos.web.app/#/settings?success=true',
    cancel_url: 'https://adk-pos.web.app/#/settings?canceled=true',
    client_reference_id: context.auth.uid,
    customer_email: context.auth.token.email
  });

  return { id: session.id, url: session.url };
});

// Stripe Webhook Endpoint (Express)
const webhookApp = express();
webhookApp.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, functions.config().stripe?.webhook_secret || "whsec_mock");
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful subscription
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await admin.firestore().collection('Users').doc(session.client_reference_id).update({
      role: 'premium',
      subscriptionId: session.subscription,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  res.json({ received: true });
});

exports.stripeWebhook = globalRegion.https.onRequest(webhookApp);

// ==========================================
// BACKGROUND FIRESTORE AGGREGATORS (UPGRADE)
// ==========================================

exports.onTransactionCreated = functions.firestore
  .document("Organizations/{orgId}/Branches/{branchId}/Transactions/{transactionId}")
  .onCreate(async (snapshot, context) => {
    const txData = snapshot.data();
    const { orgId, branchId } = context.params;
    const amount = txData.totalAmount || 0;
    
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    const summaryRef = admin.firestore()
      .collection("Organizations")
      .doc(orgId)
      .collection("Branches")
      .doc(branchId)
      .collection("SalesSummaries")
      .doc(today);
      
    try {
      await admin.firestore().runTransaction(async (transaction) => {
        const docSnapshot = await transaction.get(summaryRef);
        if (!docSnapshot.exists) {
          transaction.set(summaryRef, {
            date: today,
            totalRevenue: amount,
            totalBills: 1,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          const currentData = docSnapshot.data();
          transaction.update(summaryRef, {
            totalRevenue: (currentData.totalRevenue || 0) + amount,
            totalBills: (currentData.totalBills || 0) + 1,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });
      console.log(`Successfully aggregated sales for Org: ${orgId}, Branch: ${branchId}, Date: ${today}. Revenue +${amount}`);
    } catch (err) {
      console.error("Aggregation transaction failure:", err);
    }
    return null;
  });

