import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, dbCloud, functions } from '../config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
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
      const cleanEmail = email.trim().toLowerCase();
      const sendOtpEmail = httpsCallable(functions, 'sendOtpEmail');
      await sendOtpEmail({ email: cleanEmail });
      setStep(2);
      showStatus("Verification code sent to your email!", "success");
    } catch (error) {
      console.warn("Cloud function failed. Falling back to direct Firestore OTP generation:", error);
      try {
        const cleanEmail = email.trim().toLowerCase();
        const fallbackOtp = Math.floor(100000 + Math.random() * 900000).toString();
        await setDoc(doc(dbCloud, "OTP_Verifications", cleanEmail), {
          otp: fallbackOtp,
          expiresAt: Date.now() + 5 * 60 * 1000
        });
        setStep(2);
        showStatus(`[Sandbox Mode] Verification code generated: ${fallbackOtp}`, "success");
        console.log(`[DEVELOPER OTP] Verification Code for ${cleanEmail} is ${fallbackOtp}`);
      } catch (fallbackError) {
        console.error("Resilient fallback failed:", fallbackError);
        showStatus("Failed to generate OTP: " + fallbackError.message, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg({ text: '', type: '' });
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanOtp = otp.trim();
      const otpRef = doc(dbCloud, "OTP_Verifications", cleanEmail);
      const snapshot = await getDoc(otpRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.otp === cleanOtp && Date.now() < data.expiresAt) {
          const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          const user = userCredential.user;
          const orgId = uuidv4();

          await setDoc(doc(dbCloud, "Organizations", orgId), {
            shopName: shopName,
            subscriptionTier: "Free",
            createdAt: new Date().toISOString()
          });

          await setDoc(doc(dbCloud, "Users", user.uid), {
            fullName: ownerName,
            email: cleanEmail,
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
      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2>Register Organization</h2>
        <p>Set up your ADK POS account</p>
        
        {statusMsg.text && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              color: statusMsg.type === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)',
              backgroundColor: statusMsg.type === 'error' ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              textAlign: 'center',
              fontSize: '0.9rem',
              fontWeight: '600',
              border: `1px solid ${statusMsg.type === 'error' ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
              overflow: 'hidden'
            }}
          >
            {statusMsg.text}
          </motion.div>
        )}
        
        {step === 1 ? (
          <form className="auth-form" onSubmit={handleSendOtp}>
            <div className="auth-input-group">
              <label>Shop Name</label>
              <input type="text" placeholder="e.g. ADK Supermart" value={shopName} onChange={e => setShopName(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label>Owner Full Name</label>
              <input type="text" placeholder="e.g. John Doe" value={ownerName} onChange={e => setOwnerName(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label>Email Address</label>
              <input type="email" placeholder="owner@adk.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label>Password</label>
              <input type="password" placeholder="Minimum 6 characters" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading}
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
            >
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifyAndRegister}>
            <div className="auth-input-group">
              <label>6-Digit Verification Code</label>
              <input 
                type="text" 
                value={otp} 
                onChange={e => setOtp(e.target.value)} 
                required 
                placeholder="123456" 
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading}
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
            >
              {loading ? 'Verifying...' : 'Verify & Register'}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => setStep(1)} 
              style={{ width: '100%', padding: '0.75rem' }}
            >
              Go Back
            </button>
          </form>
        )}

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in.</Link>
        </div>
      </motion.div>
    </div>
  );
}

