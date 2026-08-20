import { useState, useEffect } from 'react';
import { dbCloud, auth } from '../config/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { useSyncManager } from '../hooks/useSyncManager';
import './SettingsScreen.css';

import toast from 'react-hot-toast';

const SRI_LANKAN_BANKS = [
  "Amana Bank",
  "Bank of Ceylon (BOC)",
  "Cargills Bank",
  "Commercial Bank of Ceylon",
  "DFCC Bank",
  "Hatton National Bank (HNB)",
  "Housing Development Finance Corporation (HDFC)",
  "National Savings Bank (NSB)",
  "Nations Trust Bank (NTB)",
  "Pan Asia Bank",
  "People's Bank",
  "Regional Development Bank (RDB)",
  "Sampath Bank",
  "SANASA Development Bank (SDB)",
  "Seylan Bank",
  "State Mortgage & Investment Bank (SMIB)",
  "Union Bank of Colombo",
  "HSBC",
  "Standard Chartered Bank",
  "Citibank"
];

export default function SettingsScreen() {
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('Free');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [premiumExpiryDate, setPremiumExpiryDate] = useState(null);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // Bank Configuration state (Admin Only)
  const [bankName, setBankName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [bankAccountsList, setBankAccountsList] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentBankId, setPaymentBankId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [adminBankAccounts, setAdminBankAccounts] = useState([]);
  const [detectedBrand, setDetectedBrand] = useState('');

  const navigate = useNavigate();

  const syncConfig = useSyncManager();
  const orgId = syncConfig?.orgId || localStorage.getItem('adk_orgId') || '';
  const branchId = syncConfig?.branchId || localStorage.getItem('adk_branchId') || 'Main';
  const role = localStorage.getItem('adk_role') || 'User';
  const userEmail = localStorage.getItem('adk_userEmail') || '';

  const isSuperAdmin = userEmail.trim().toLowerCase() === 'arikarran14@gmail.com';
  const hasPremium = isSuperAdmin || tier === 'Premium';

  const showStatus = (text, type = 'success') => {
    if (type === 'error') {
      toast.error(text);
    } else if (type === 'info') {
      toast(text, { icon: 'ℹ️' });
    } else {
      toast.success(text);
    }
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
          if (data.premium_expiry_date) {
            setPremiumExpiryDate(data.premium_expiry_date);
          }
        }
      } catch (err) {
        console.log("Offline mode, using cached settings if any.", err);
      }
    }
    fetchOrg();
  }, [orgId]);

  // Load Bank Accounts
  useEffect(() => {
    async function fetchBankAccounts() {
      try {
        const snap = await getDocs(collection(dbCloud, "BankAccounts"));
        const list = [];
        snap.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setBankAccountsList(list);
      } catch (e) {
        console.error("Could not fetch bank accounts", e);
      }
    }
    fetchBankAccounts();
  }, [isSuperAdmin]);

  const handleSaveShopDetails = async (e) => {
    e.preventDefault();
    if (!orgId) return showStatus('No active organization context found.', 'error');
    setLoading(true);
    try {
      await updateDoc(doc(dbCloud, "Organizations", orgId), {
        shopName,
        address,
        phone
      });
      window.dispatchEvent(new CustomEvent('shopDetailsUpdated', { detail: { shopName } }));
      
      try {
        const channel = new BroadcastChannel('adk_settings_sync');
        channel.postMessage({ type: 'SHOP_DETAILS_UPDATED', shopName });
        channel.close();
      } catch (e) {
        console.warn("Could not broadcast shop details update", e);
      }

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
    try {
      const user = auth.currentUser;
      if (user) {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
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
      const localProducts = await db.products.toArray();
      let uploadCount = 0;
      for (const prod of localProducts) {
        const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, prod.id);
        await setDoc(docRef, prod, { merge: true });
        uploadCount++;
      }

      const productsRef = collection(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`);
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

  useEffect(() => {
    async function fetchAdminBanks() {
      if (showPaymentModal) {
        try {
          const snap = await getDocs(collection(dbCloud, "BankAccounts"));
          const list = [];
          snap.forEach(doc => {
            if (doc.data().isEnabled !== false) {
              list.push({ id: doc.id, ...doc.data() });
            }
          });
          setAdminBankAccounts(list);
          if (list.length > 0) {
            setPaymentBankId(list[0].id);
          }
        } catch (e) {
          console.error("Could not load admin bank accounts:", e);
        }
      }
    }
    fetchAdminBanks();
  }, [showPaymentModal]);

  const handleCardNumberChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 16) val = val.slice(0, 16);
    let formatted = val.match(/.{1,4}/g)?.join(' ') || val;
    setCardNumber(formatted);

    if (val.startsWith('4')) {
      setDetectedBrand('Visa');
    } else if (val.startsWith('5') || val.startsWith('2')) {
      setDetectedBrand('MasterCard');
    } else if (val.startsWith('62')) {
      setDetectedBrand('UnionPay');
    } else {
      setDetectedBrand('');
    }
  };

  const handleExpiryChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 4) val = val.slice(0, 4);
    let formatted = val;
    if (val.length >= 2) {
      formatted = val.slice(0, 2) + '/' + val.slice(2);
    }
    setCardExpiry(formatted);
  };

  const handleProcessPayment = async (e) => {
    e.preventDefault();
    if (!paymentBankId) {
      showStatus("Please select a bank account first.", "error");
      return;
    }
    const cleanCard = cardNumber.replace(/\s/g, '');
    if (cleanCard.length < 16) {
      showStatus("Invalid Card Number. Must be 16 digits.", "error");
      return;
    }
    if (cardExpiry.length < 5) {
      showStatus("Invalid Expiry Date (MM/YY).", "error");
      return;
    }
    if (cardCvv.length < 3) {
      showStatus("Invalid CVV.", "error");
      return;
    }

    setProcessingPayment(true);
    showStatus("Processing card payment of Rs. 5,000...", "info");
    
    setTimeout(async () => {
      try {
        const randomKey = "LIC-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const keyRef = doc(dbCloud, "LicenseKeys", randomKey);
        await setDoc(keyRef, {
          key: randomKey,
          email: userEmail,
          durationMonths: 1,
          isUsed: false,
          createdAt: new Date().toISOString(),
          selectedBankAccountId: paymentBankId,
          amountPaid: 5000
        });

        const payRef = doc(collection(dbCloud, "Payments"));
        await setDoc(payRef, {
          paymentId: payRef.id,
          amount: 5000,
          userEmail,
          bankAccountId: paymentBankId,
          cardholderName: cardHolder,
          licenseKeyGenerated: randomKey,
          timestamp: new Date().toISOString()
        });

        setProcessingPayment(false);
        setShowPaymentModal(false);

        setCardNumber('');
        setCardHolder('');
        setCardExpiry('');
        setCardCvv('');
        setDetectedBrand('');

        const applyNow = window.confirm(`Payment processed successfully!\n\nYour Premium License Key is:\n${randomKey}\n\nWould you like to automatically apply this key to upgrade your account instantly?`);
        if (applyNow) {
          setLoading(true);
          await updateDoc(keyRef, {
            isUsed: true,
            usedByOrgId: orgId,
            usedAt: new Date().toISOString()
          });
          
          const oneMonthFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await updateDoc(doc(dbCloud, "Organizations", orgId), {
            subscriptionTier: "Premium",
            premiumExpiresAt: oneMonthFromNow
          });
          
          const currentUser = auth.currentUser;
          if (currentUser) {
            await updateDoc(doc(dbCloud, "Users", currentUser.uid), {
              role: "premium"
            });
          }
          setTier("Premium");
          showStatus("Upgrade successful! Your account is now Premium for 1 month.", "success");
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        showStatus("Payment succeeded, but key generation failed: " + err.message, "error");
        setProcessingPayment(false);
        setLoading(false);
      }
    }, 2000);
  };

  const handleApplyLicense = async (e) => {
    e.preventDefault();
    if (!orgId) return showStatus('No active organization context found.', 'error');
    setLoading(true);
    try {
      let cleanKey = licenseKey.trim().toUpperCase();
      
      // Auto-prefix normalization: handle cases where user inputs only the key suffix
      if (!cleanKey.startsWith('ADK-LIC-') && !cleanKey.startsWith('LIC-')) {
        if (cleanKey.length === 6) {
          cleanKey = `ADK-LIC-${cleanKey}`;
        } else if (cleanKey.length === 9) {
          cleanKey = `LIC-${cleanKey}`;
        }
      }
      
      const keyRef = doc(dbCloud, "LicenseKeys", cleanKey);
      const keySnap = await getDoc(keyRef);
      
      if (!keySnap.exists()) {
        showStatus("Invalid ADK License Key.", "error");
        setLoading(false);
        return;
      }
      
      const keyData = keySnap.data();
      if (keyData.isUsed) {
        showStatus("This License Key has already been activated.", "error");
        setLoading(false);
        return;
      }
      
      if (keyData.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
        showStatus(`This License Key is registered to ${keyData.email}, not your email.`, "error");
        setLoading(false);
        return;
      }
      
      await updateDoc(keyRef, {
        isUsed: true,
        usedByOrgId: orgId,
        usedAt: new Date().toISOString()
      });
      
      const oneMonthFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await updateDoc(doc(dbCloud, "Organizations", orgId), {
        subscriptionTier: "Premium",
        premiumExpiresAt: oneMonthFromNow
      });
      
      const currentUser = auth.currentUser;
      if (currentUser) {
        await updateDoc(doc(dbCloud, "Users", currentUser.uid), {
          role: "premium"
        });
      }
      
      setTier("Premium");
      showStatus("Successfully upgraded to Premium Tier!", "success");
      setLicenseKey('');
    } catch (err) {
      console.error(err);
      showStatus("Failed to apply license: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddBankAccount = async (e) => {
    e.preventDefault();
    setBankLoading(true);
    try {
      const newAcc = {
        bankName,
        accountHolder: holderName,
        accountNumber: accNumber,
        isEnabled: true,
        lastUpdated: new Date().toISOString()
      };
      const docRef = doc(collection(dbCloud, "BankAccounts"));
      await setDoc(docRef, newAcc);
      setBankAccountsList(prev => [...prev, { id: docRef.id, ...newAcc }]);
      setBankName('');
      setHolderName('');
      setAccNumber('');
      showStatus("Bank account added successfully!", "success");
    } catch (err) {
      console.error(err);
      showStatus("Failed to add bank account.", "error");
    } finally {
      setBankLoading(false);
    }
  };

  const handleDeleteBankAccount = async (id) => {
    try {
      await deleteDoc(doc(dbCloud, "BankAccounts", id));
      setBankAccountsList(prev => prev.filter(b => b.id !== id));
      showStatus("Bank account deleted.", "success");
    } catch (err) {
      console.error(err);
      showStatus("Failed to delete account.", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      try {
        await Promise.all(db.tables.map(table => table.clear()));
      } catch (dbErr) {
        console.error("Error clearing Dexie tables on logout:", dbErr);
      }
    } catch (e) {
      console.error("Signout error:", e);
    }
    localStorage.clear();
    navigate('/login');
  };

  const roleDisplay = isSuperAdmin ? "Super Admin" : (hasPremium ? "Premium " + role : role);

  return (
    <div className="settings-layout">
      <div className="settings-header">
        <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Settings & Account Profile</h2>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button 
            className="btn btn-success" 
            onClick={handleForceSync} 
            disabled={syncing}
            style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: '700' }}
          >
            {syncing ? 'Syncing...' : 'Force Cloud Sync'}
          </button>
          <button 
            className="btn btn-danger" 
            onClick={handleLogout}
            style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: '600' }}
          >
            Logout
          </button>
        </div>
      </div>

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
            <p><strong>Role:</strong> {roleDisplay}</p>
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

        {/* Bank Accounts */}
        <div className="settings-card">
          <h3>{isSuperAdmin ? 'Configure Bank Accounts (Admin Only)' : 'Active Bank Accounts'}</h3>
          {isSuperAdmin && (
            <form onSubmit={handleAddBankAccount}>
              <div className="form-group">
                <label>Bank Name</label>
                <input 
                  type="text" 
                  value={bankName} 
                  onChange={e => setBankName(e.target.value)} 
                  required 
                  placeholder="e.g. Bank of Ceylon" 
                  list="srilankan-banks"
                />
                <datalist id="srilankan-banks">
                  {SRI_LANKAN_BANKS.map((bank, index) => (
                    <option key={index} value={bank} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Account Holder Name</label>
                <input 
                  type="text" 
                  value={holderName} 
                  onChange={e => setHolderName(e.target.value)} 
                  required 
                  placeholder="e.g. ADK Solutions" 
                />
              </div>
              <div className="form-group">
                <label>Account Number</label>
                <input 
                  type="text" 
                  value={accNumber} 
                  onChange={e => setAccNumber(e.target.value)} 
                  required 
                  placeholder="e.g. 123456789" 
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={bankLoading}>Add Account</button>
            </form>
          )}
          
          <h4 style={{ marginTop: isSuperAdmin ? '1.5rem' : '0.5rem', marginBottom: '0.75rem' }}>Active Accounts</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {bankAccountsList.map(b => (
                <li 
                  key={b.id} 
                  style={{ 
                    display: 'flex', justifyContent: 'space-between', 
                    alignItems: 'center', padding: '0.5rem', 
                    borderBottom: '1px solid var(--border-light)' 
                  }}
                >
                  <div>
                    <strong>{b.bankName}</strong><br />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{b.accountNumber} ({b.accountHolder})</span>
                  </div>
                  {isSuperAdmin && (
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} 
                      onClick={() => handleDeleteBankAccount(b.id)}
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
              {bankAccountsList.length === 0 && (
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No accounts configured.</span>
              )}
            </ul>
        </div>

        {/* Subscription & Billing Card (Admin/Owner Only) */}
        {role !== 'Cashier' && (
          <div className="settings-card subscription-card">
            <h3>Subscription & Billing</h3>
            <div className="tier-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1rem' }}>
              <p>Current Tier: <strong className={`tier-badge tier-${tier.toLowerCase()}`} style={{
                padding: '0.25rem 0.50rem',
                borderRadius: '6px',
                background: tier === 'Premium' ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-hover))' : 'var(--bg-secondary)',
                color: 'white',
                fontSize: '0.85rem',
                marginLeft: '0.5rem',
                display: 'inline-block'
              }}>{tier}</strong></p>
              
              <p>Status: <span style={{ color: tier === 'Premium' ? 'var(--secondary-emerald)' : 'var(--text-muted)', fontWeight: 'bold' }}>{tier === 'Premium' ? 'Active Premium' : 'Free Tier (50 Bill Limit)'}</span></p>

              {tier === 'Premium' && premiumExpiryDate && (
                <>
                  <p>Expiry Date: <span style={{ fontWeight: 'bold' }}>{new Date(premiumExpiryDate).toLocaleDateString()}</span></p>
                  <p>Remaining: <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {Math.ceil((new Date(premiumExpiryDate) - new Date()) / (1000 * 60 * 60 * 24))} Days
                  </span></p>
                </>
              )}
            </div>
            
            {tier !== 'Premium' && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                  To upgrade to Premium and unlock unlimited bills, please contact the Super Admin or Sales team.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
