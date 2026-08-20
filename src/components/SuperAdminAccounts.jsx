import { useState, useEffect } from 'react';
import { auth, dbCloud } from '../config/firebase';
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

const SuperAdminAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [accountHistory, setAccountHistory] = useState([]);

  async function fetchAccounts() {
    try {
      setLoading(true);
      
      // Fetch users to map owner emails if missing in Organizations
      const usersSnap = await getDocs(collection(dbCloud, "Users"));
      const orgToEmailMap = {};
      usersSnap.forEach(d => {
        const userData = d.data();
        if (userData.organizationId && userData.email) {
          orgToEmailMap[userData.organizationId] = userData.email;
        }
      });

      const snap = await getDocs(collection(dbCloud, "Organizations"));
      const list = [];
      snap.forEach(doc => {
        const data = doc.data();
        const fallbackEmail = data.ownerEmail || orgToEmailMap[doc.id] || 'N/A';
        list.push({ 
          id: doc.id, 
          ...data,
          ownerEmail: fallbackEmail
        });
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAccounts(list);
    } catch (err) {
      console.error("Could not fetch accounts:", err);
      alert("Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  const calculatePremiumStatus = (account) => {
    if (!account.premium_expiry_date) return { status: 'Free', remaining: 0 };
    
    const expiryDate = new Date(account.premium_expiry_date);
    const now = new Date();
    
    if (now > expiryDate) {
      return { status: 'Expired', remaining: 0 };
    }
    
    const diffTime = Math.abs(expiryDate - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return { status: 'Active', remaining: diffDays };
  };

  const handleGivePremium = async (account) => {
    const { status } = calculatePremiumStatus(account);
    const isExtension = status === 'Active';
    
    const confirmMsg = isExtension 
      ? `This account already has Active Premium. Do you want to EXTEND it for another 30 days from its current expiry date?`
      : `Give Premium Access to ${account.name || account.shopName || 'this business'} for 30 days?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const now = new Date();
      let startDate = new Date();
      let expiryDate = new Date();
      
      if (isExtension && account.premium_expiry_date) {
        // Extend from current expiry
        const currentExpiry = new Date(account.premium_expiry_date);
        if (currentExpiry > now) {
          startDate = currentExpiry;
          expiryDate = new Date(currentExpiry.getTime());
        }
      }
      
      // Add 30 days
      expiryDate.setDate(expiryDate.getDate() + 30);
      
      const startIso = startDate.toISOString();
      const expiryIso = expiryDate.toISOString();

      // 1. Update Organization
      const orgRef = doc(dbCloud, "Organizations", account.id);
      await updateDoc(orgRef, {
        premium_status: 'Active',
        subscriptionTier: 'Premium',
        premium_start_date: startIso,
        premium_expiry_date: expiryIso,
        last_premium_activation: new Date().toISOString()
      });

      // 2. Also update User role for backwards compatibility
      if (account.ownerId) {
        const userRef = doc(dbCloud, "Users", account.ownerId);
        await updateDoc(userRef, { role: 'premium' }).catch(e => console.log('User role update skipped', e));
      }

      // 3. Log History
      const historyId = uuidv4();
      await setDoc(doc(dbCloud, "PremiumHistory", historyId), {
        history_id: historyId,
        account_id: account.id,
        account_name: account.name || account.shopName || 'Unknown',
        granted_by: auth.currentUser?.email || 'Admin',
        granted_at: new Date().toISOString(),
        start_date: startIso,
        expiry_date: expiryIso,
        duration_days: 30,
        status: isExtension ? 'Extended' : 'Activated'
      });

      alert(`Premium access granted successfully until ${expiryDate.toLocaleDateString()}!`);
      fetchAccounts(); // Refresh list

    } catch (err) {
      console.error(err);
      alert("Failed to grant premium access: " + err.message);
    }
  };

  const viewHistory = async (account) => {
    setSelectedAccount(account);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      // Fetch history for this account
      const snap = await getDocs(collection(dbCloud, "PremiumHistory"));
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.account_id === account.id) {
          list.push(data);
        }
      });
      list.sort((a, b) => new Date(b.granted_at) - new Date(a.granted_at));
      setAccountHistory(list);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Compute Summary Metrics
  const summary = {
    total: accounts.length,
    active: 0,
    expired: 0,
    free: 0
  };

  accounts.forEach(acc => {
    const { status } = calculatePremiumStatus(acc);
    if (status === 'Active') summary.active++;
    else if (status === 'Expired') summary.expired++;
    else summary.free++;
  });

  const filteredAccounts = accounts.filter(a => 
    (a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (a.shopName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (a.ownerEmail || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ padding: '2rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', overflowY: 'auto' }}>
      <h1 style={{ margin: 0, fontWeight: 'bold', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Super Admin – Account Management
      </h1>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Total Accounts', value: summary.total, color: 'var(--text-primary)' },
          { label: 'Active Premium', value: summary.active, color: 'var(--secondary-emerald)' },
          { label: 'Expired Premium', value: summary.expired, color: 'var(--secondary-rose)' },
          { label: 'Free Accounts', value: summary.free, color: 'var(--text-muted)' }
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-glass)', borderRadius: '12px', padding: '1.5rem', 
            border: '1px solid var(--border-light)', boxShadow: '0 4px 30px rgba(0,0,0,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{card.label}</h3>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: card.color }}>{card.value}</span>
          </div>
        ))}
      </div>

      {/* Main Table Area */}
      <div style={{ background: 'var(--bg-glass)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-light)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Registered Accounts</h2>
          <input 
            type="text" 
            placeholder="Search accounts..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '300px'
            }}
          />
        </div>

        {loading ? (
          <p>Loading accounts...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '0.75rem' }}>Business Name</th>
                  <th style={{ padding: '0.75rem' }}>Owner Email</th>
                  <th style={{ padding: '0.75rem' }}>Created</th>
                  <th style={{ padding: '0.75rem' }}>Premium Status</th>
                  <th style={{ padding: '0.75rem' }}>Expiry Date</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map(acc => {
                  const { status, remaining } = calculatePremiumStatus(acc);
                  
                  let statusColor = 'var(--text-muted)';
                  let statusBg = 'var(--bg-secondary)';
                  if (status === 'Active') { statusColor = 'white'; statusBg = 'var(--secondary-emerald)'; }
                  if (status === 'Expired') { statusColor = 'white'; statusBg = 'var(--secondary-rose)'; }

                  return (
                    <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{acc.name || acc.shopName || 'Unknown Business'}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{acc.ownerEmail || 'N/A'}</td>
                      <td style={{ padding: '0.75rem' }}>{new Date(acc.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '4px', background: statusBg, color: statusColor, 
                            fontSize: '0.75rem', fontWeight: 'bold', width: 'fit-content'
                          }}>
                            {status === 'Active' ? '🟢 Premium Active' : status === 'Expired' ? '🔴 Premium Expired' : '⚪ Free'}
                          </span>
                          {status === 'Active' && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{remaining} Days Remaining</span>}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {acc.premium_expiry_date ? new Date(acc.premium_expiry_date).toLocaleDateString() : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => viewHistory(acc)}
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        >
                          History
                        </button>
                        <button 
                          onClick={() => handleGivePremium(acc)}
                          className="btn btn-primary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        >
                          {status === 'Active' ? 'Extend Premium' : 'Give Premium Access'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredAccounts.length === 0 && <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No accounts found.</p>}
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistoryModal && selectedAccount && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-primary)', padding: '2rem', borderRadius: '12px', width: '600px', maxWidth: '90vw',
            border: '1px solid var(--border-light)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ marginTop: 0 }}>Premium History - {selectedAccount.name}</h2>
            {historyLoading ? <p>Loading history...</p> : (
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Date</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                    <th style={{ padding: '0.5rem' }}>Duration</th>
                    <th style={{ padding: '0.5rem' }}>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {accountHistory.map(h => (
                    <tr key={h.history_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.5rem' }}>{new Date(h.granted_at).toLocaleDateString()}</td>
                      <td style={{ padding: '0.5rem' }}>{h.status || 'Premium Granted'}</td>
                      <td style={{ padding: '0.5rem' }}>{h.duration_days} Days</td>
                      <td style={{ padding: '0.5rem' }}>{new Date(h.expiry_date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {accountHistory.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }}>No premium history found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowHistoryModal(false)}
              style={{ marginTop: '1.5rem', width: '100%' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminAccounts;
