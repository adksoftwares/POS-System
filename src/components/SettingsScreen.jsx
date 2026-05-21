import React, { useState, useEffect } from 'react';
import { dbCloud, auth } from '../config/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { useSyncManager } from '../hooks/useSyncManager';
import './SettingsScreen.css';

export default function SettingsScreen() {
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('Free');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  const navigate = useNavigate();

  const syncConfig = useSyncManager();
  const orgId = syncConfig?.orgId || localStorage.getItem('adk_orgId') || '';
  const branchId = syncConfig?.branchId || localStorage.getItem('adk_branchId') || 'Main';
  const role = localStorage.getItem('adk_role') || 'User';
  const userEmail = localStorage.getItem('adk_userEmail') || '';

  const showStatus = (text, type = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => {
      setStatusMsg({ text: '', type: '' });
    }, 4000);
  };

  useEffect(() => {
    async function fetchOrg() {
      if (!orgId) return;
      try {
        const orgRef = doc(dbCloud, "Organizations", orgId);
        const snap = await getDoc(orgRef);
        if (snap.exists()) {
          const data = snap.data();
          setShopName(data.shopName || '');
          setAddress(data.address || '');
          setPhone(data.phone || '');
          setTier(data.subscriptionTier || 'Free');
        }
      } catch (e) {
        console.log("Offline mode, using cached settings if any.");
      }
    }
    fetchOrg();
  }, [orgId]);

  const handleSaveShopDetails = async (e) => {
    e.preventDefault();
    if (!orgId) return showStatus('No active organization context found.', 'error');
    setLoading(true);
    setStatusMsg({ text: '', type: '' });
    try {
      await updateDoc(doc(dbCloud, "Organizations", orgId), {
        shopName,
        address,
        phone
      });
      showStatus("Shop details updated successfully!", "success");
    } catch (err) {
      console.error(err);
      showStatus("Failed to update shop details. You might be offline.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!userEmail) return;
    setStatusMsg({ text: '', type: '' });
    try {
      await sendPasswordResetEmail(auth, userEmail);
      showStatus("Password reset email sent to " + userEmail, "success");
    } catch (err) {
      console.error(err);
      showStatus("Failed to send reset email.", "error");
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return showStatus("New passwords do not match.", "error");
    }
    if (newPassword.length < 6) {
      return showStatus("New password must be at least 6 characters.", "error");
    }

    setChangePasswordLoading(true);
    setStatusMsg({ text: '', type: '' });
    try {
      const user = auth.currentUser;
      if (user) {
        // Reauthenticate user
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        // Update password
        await updatePassword(user, newPassword);
        showStatus("Password updated successfully!", "success");
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        showStatus("No authenticated user session found. Try logging out and back in.", "error");
      }
    } catch (err) {
      console.error(err);
      showStatus("Failed to update password: " + err.message, "error");
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleForceSync = async () => {
    if (!orgId) return showStatus('No active organization session found. Please try logging out and back in.', 'error');
    setSyncing(true);
    showStatus("Initializing Cloud Synchronization...", "info");
    try {
      // 1. Fetch from Dexie and Push to Cloud
      const localProducts = await db.products.toArray();
      let uploadCount = 0;
      for (const prod of localProducts) {
        const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/Main/Products`, prod.id);
        await setDoc(docRef, prod, { merge: true });
        uploadCount++;
      }

      // 2. Fetch from Cloud and Pull to local Dexie
      const productsRef = collection(dbCloud, `Organizations/${orgId}/Branches/Main/Products`);
      const snapshot = await getDocs(productsRef);
      const cloudProducts = [];
      snapshot.forEach((doc) => {
        cloudProducts.push({ id: doc.id, ...doc.data() });
      });

      if (cloudProducts.length > 0) {
        await db.products.bulkPut(cloudProducts);
      }

      showStatus(`Sync successful! Pushed ${uploadCount} local products and synchronized ${cloudProducts.length} cloud products successfully!`, "success");
    } catch (err) {
      console.error(err);
      showStatus("Sync failed: " + err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleApplyLicense = async (e) => {
    e.preventDefault();
    alert(`Validating license key: ${licenseKey}... (Demo)`);
    setLicenseKey('');
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate('/login');
  };

  return (
    <div className="settings-layout">
      <div className="settings-header">
        <h2>Settings & Account Profile</h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            className="btn btn-success" 
            onClick={handleForceSync} 
            disabled={syncing}
            style={{ backgroundColor: 'var(--secondary-emerald)', border: 'none' }}
          >
            {syncing ? 'Syncing...' : 'Force Cloud Sync'}
          </button>
          <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {statusMsg.text && (
        <div style={{
          color: statusMsg.type === 'error' ? 'var(--tertiary-crimson)' : 'var(--secondary-emerald)',
          backgroundColor: statusMsg.type === 'error' ? '#fce8e6' : '#e6f4ea',
          padding: '0.75rem',
          borderRadius: '6px',
          margin: '0 2rem 1.5rem 2rem',
          textAlign: 'center',
          fontSize: '0.95rem',
          fontWeight: 'bold',
          border: '1px solid ' + (statusMsg.type === 'error' ? '#f5c2c2' : '#c2f5d3')
        }}>
          {statusMsg.text}
        </div>
      )}

      <div className="settings-grid">
        {/* Shop Details Card (Admin Only) */}
        {role !== 'Cashier' && (
          <div className="settings-card">
            <h3>Shop Details</h3>
            <form onSubmit={handleSaveShopDetails}>
              <div className="form-group">
                <label>Shop Name</label>
                <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>Save Details</button>
            </form>
          </div>
        )}

        {/* Account Profile Card (Everyone) */}
        <div className="settings-card">
          <h3>Account Profile</h3>
          <div className="profile-info" style={{ marginBottom: '1rem' }}>
            <p><strong>Email:</strong> {userEmail}</p>
            <p><strong>Role:</strong> {role}</p>
            <p><strong>Org ID:</strong> {orgId || 'Resolving active cloud session...'}</p>
          </div>
          <button className="btn btn-secondary" onClick={handlePasswordReset}>Send Password Reset Email</button>
        </div>

        {/* Change Password Card (Everyone) */}
        <div className="settings-card">
          <h3>Change Password In-App</h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <input 
                type="password" 
                value={currentPassword} 
                onChange={e => setCurrentPassword(e.target.value)} 
                placeholder="Enter current password" 
                required 
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="Minimum 6 characters" 
                required 
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Repeat new password" 
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={changePasswordLoading}>
              {changePasswordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Subscription & Billing Card (Admin Only) */}
        {role !== 'Cashier' && (
          <div className="settings-card subscription-card">
            <h3>Subscription & Billing</h3>
            <div className="tier-info">
              <p>Current Tier: <strong className={`tier-badge tier-${tier.toLowerCase()}`}>{tier}</strong></p>
              <p>Status: Active</p>
            </div>
            <hr />
            <form onSubmit={handleApplyLicense} className="license-form">
              <label>Upgrade Account</label>
              <input type="text" placeholder="Enter ADK License Key" value={licenseKey} onChange={e => setLicenseKey(e.target.value)} required />
              <button type="submit" className="btn btn-success">Apply Key</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
