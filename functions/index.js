const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().gmail.email,
    pass: functions.config().gmail.password,
  },
});

exports.sendOtpEmail = functions.https.onCall(async (data, context) => {
  const targetEmail = data.email;

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  const expirationTime = Date.now() + 5 * 60 * 1000;
  await admin.firestore().collection("OTP_Verifications").doc(targetEmail).set({
    otp: otpCode,
    expiresAt: expirationTime
  });

  const mailOptions = {
    from: '"ADK Software Solutions" <adkcom2114@gmail.com>',
    to: targetEmail,
    subject: "Your ADK Smart POS Verification Code",
    html: `
      <h2>Welcome to ADK Smart POS!</h2>
      <p>Your registration verification code is:</p>
      <h1 style="color: #1A237E; letter-spacing: 5px;">${otpCode}</h1>
      <p>This code will expire in 5 minutes.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: "OTP sent successfully" };
  } catch (error) {
    throw new functions.https.HttpsError("internal", "Failed to send email");
  }
});
