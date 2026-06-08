import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, dbCloud } from '../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import './Auth.css';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const cleanEmail = email.trim().toLowerCase();
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

      const userProfile = await getDoc(doc(dbCloud, "Users", user.uid));
      
      if (userProfile.exists()) {
        const data = userProfile.data();
        
        localStorage.setItem("adk_role", data.role || "Cashier");
        localStorage.setItem("adk_orgId", data.organizationId || "");
        localStorage.setItem("adk_branchId", data.branchId || "");
        localStorage.setItem("adk_userEmail", user.email);

        navigate('/'); 
      } else {
        // Self-Healing: Auto-register organization and user profile in Firestore
        const orgId = uuidv4();
        
        await setDoc(doc(dbCloud, "Organizations", orgId), {
          shopName: "ADK Supermart",
          subscriptionTier: "Free",
          createdAt: new Date().toISOString()
        });

        await setDoc(doc(dbCloud, "Users", user.uid), {
          fullName: "Store Manager",
          email: user.email,
          role: "Owner",
          organizationId: orgId,
          branchId: "Main"
        });

        localStorage.setItem("adk_role", "Owner");
        localStorage.setItem("adk_orgId", orgId);
        localStorage.setItem("adk_branchId", "Main");
        localStorage.setItem("adk_userEmail", user.email);
        
        navigate('/');
      }
    } catch (error) {
      console.error("Login failed!", error.message);
      setErrorMsg("Incorrect Email or Password");
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
        <h2>ADK Smart POS</h2>
        <p>Sign in to your terminal</p>
        
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              color: 'var(--accent-danger)',
              backgroundColor: 'rgba(244, 63, 94, 0.12)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              textAlign: 'center',
              fontSize: '0.9rem',
              fontWeight: '600',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              overflow: 'hidden'
            }}
          >
            {errorMsg}
          </motion.div>
        )}
        
        <form className="auth-form" onSubmit={handleLogin}>
          <div className="auth-input-group">
            <label>Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="name@adk.com"
              required 
            />
          </div>
          <div className="auth-input-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="auth-footer">
          Don't have an account? <Link to="/register">Register your shop.</Link>
        </div>
      </motion.div>
    </div>
  );
}

