import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, dbCloud, functions } from '../config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { v4 as uuidv4 } from 'uuid';
import './Auth.css';

export default function RegisterScreen() {
  const [step, setStep] = useState(1);
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const navigate = useNavigate();

  const showStatus = (text, type = 'success') => {
    setStatusMsg({ text, type });
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg({ text: '', type: '' });
    try {
      const sendOtpEmail = httpsCallable(functions, 'sendOtpEmail');
      await sendOtpEmail({ email });
      setStep(2);
      showStatus("Verification code sent to your email!", "success");
    } catch (error) {
      console.error("Error sending OTP:", error);
      showStatus("Failed to send OTP: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg({ text: '', type: '' });
    try {
      const otpRef = doc(dbCloud, "OTP_Verifications", email);
      const snapshot = await getDoc(otpRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.otp === otp && Date.now() < data.expiresAt) {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;
          const orgId = uuidv4();

          await setDoc(doc(dbCloud, "Organizations", orgId), {
            shopName: shopName,
            subscriptionTier: "Free",
            createdAt: new Date().toISOString()
          });

          await setDoc(doc(dbCloud, "Users", user.uid), {
            fullName: ownerName,
            email: email,
            role: "Owner",
            organizationId: orgId,
            branchId: "Main"
          });

          localStorage.setItem("adk_role", "Owner");
          localStorage.setItem("adk_orgId", orgId);
          localStorage.setItem("adk_branchId", "Main");
          localStorage.setItem("adk_userEmail", email);

          navigate('/');
        } else {
          showStatus("Invalid or Expired OTP.", "error");
        }
      } else {
         showStatus("No OTP requested for this email.", "error");
      }
    } catch (error) {
      console.error("Registration failed:", error);
      showStatus("Registration failed: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Register Organization</h2>
        <p>Set up your ADK POS account</p>
        
        {statusMsg.text && (
          <div style={{
            color: statusMsg.type === 'error' ? 'var(--tertiary-crimson)' : 'var(--secondary-emerald)',
            backgroundColor: statusMsg.type === 'error' ? '#fce8e6' : '#e6f4ea',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            textAlign: 'center',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            border: '1px solid ' + (statusMsg.type === 'error' ? '#f5c2c2' : '#c2f5d3')
          }}>
            {statusMsg.text}
          </div>
        )}
        
        {step === 1 ? (
          <form className="auth-form" onSubmit={handleSendOtp}>
            <div className="auth-input-group">
              <label>Shop Name</label>
              <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label>Owner Full Name</label>
              <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifyAndRegister}>
            <div className="auth-input-group">
              <label>6-Digit Verification Code</label>
              <input type="text" value={otp} onChange={e => setOtp(e.target.value)} required placeholder="123456" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Register'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in.</Link>
        </div>
      </div>
    </div>
  );
}
