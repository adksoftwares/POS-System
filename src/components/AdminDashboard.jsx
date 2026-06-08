import { useState, useEffect } from 'react';
import { auth, dbCloud } from '../config/firebase';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // License Keys state
  const [licenseKeys, setLicenseKeys] = useState([]);
  const [newKeyEmail, setNewKeyEmail] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keysLoading, setKeysLoading] = useState(true);

  async function fetchLicenseKeys() {
    try {
      const snap = await getDocs(collection(dbCloud, "LicenseKeys"));
      const list = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setLicenseKeys(list);
    } catch (err) {
      console.error("Could not fetch license keys:", err);
    } finally {
      setKeysLoading(false);
    }
  }

  const generateLicenseKey = async (e) => {
    e.preventDefault();
    if (!newKeyEmail.trim()) return;
    setGeneratingKey(true);
    try {
      const cleanEmail = newKeyEmail.trim().toLowerCase();
      const randHex = Math.random().toString(36).substr(2, 6).toUpperCase();
      const generatedKey = `ADK-LIC-${randHex}`;
      
      const docRef = doc(dbCloud, "LicenseKeys", generatedKey);
      const keyObj = {
        key: generatedKey,
        email: cleanEmail,
        durationMonths: 1,
        isUsed: false,
        createdAt: new Date().toISOString(),
        usedByOrgId: '',
        usedAt: ''
      };
      await setDoc(docRef, keyObj);
      setLicenseKeys(prev => [keyObj, ...prev]);
      setNewKeyEmail('');
      alert(`License Key generated successfully!\n\nKey: ${generatedKey}\nUser: ${cleanEmail}`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate key: " + err.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  async function fetchUsers() {
    try {
      const token = await auth.currentUser.getIdToken();
      // Replace URL with deployed Firebase function URL in production
      const response = await fetch('http://127.0.0.1:5001/adk-smart-pos/us-central1/adminApi/listUsers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(data);
      } else {
        alert("Failed to load users: " + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
    fetchLicenseKeys();
  }, []);

  const toggleTier = async (userId, currentRole) => {
    const newRole = currentRole === 'premium' ? 'normal' : 'premium';
    if (!window.confirm(`Change user to ${newRole}?`)) return;

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('http://127.0.0.1:5001/adk-smart-pos/us-central1/adminApi/toggleTier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: userId, newRole })
      });
      if (res.ok) {
        alert("Tier updated successfully");
        fetchUsers();
      } else {
        alert("Failed to update tier");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const forceReset = async (email) => {
    if (!window.confirm(`Generate password reset link for ${email}?`)) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('http://127.0.0.1:5001/adk-smart-pos/us-central1/adminApi/forcePasswordReset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Reset Link Generated (Check Console): ${data.link}`);
        console.log("Reset Link: ", data.link);
      } else {
        alert("Failed to generate link");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '2rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', overflowY: 'auto' }}>
      <h1 style={{ margin: 0, fontWeight: 'bold', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Super Admin Control Panel
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Left Side: Users Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>👤 Global User Registry</h2>
          {loading ? (
            <p>Loading global users...</p>
          ) : (
            <div style={{
              background: 'var(--bg-glass)',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--border-light)'
            }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '0.75rem' }}>Email</th>
                    <th style={{ padding: '0.75rem' }}>Role</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '0.75rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          padding: '0.2rem 0.4rem',
                          borderRadius: '4px',
                          background: u.role === 'premium' ? 'var(--secondary-emerald)' : 'var(--bg-secondary)',
                          color: u.role === 'premium' ? 'white' : 'var(--text-primary)',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          {u.role || 'normal'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button 
                          onClick={() => toggleTier(u.id, u.role)} 
                          className="btn btn-primary" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', marginRight: '0.4rem' }}
                        >
                          Toggle Tier
                        </button>
                        <button 
                          onClick={() => forceReset(u.email)} 
                          className="btn btn-danger"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          Reset PW
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Side: License Keys Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>🔑 Premium License Keys</h2>
          
          {/* Generate Key Card */}
          <div style={{
            background: 'var(--bg-glass)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-light)'
          }}>
            <form onSubmit={generateLicenseKey} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>Generate New 1-Month Premium Key</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="email" 
                  placeholder="Target User Email Address" 
                  value={newKeyEmail}
                  onChange={e => setNewKeyEmail(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
                <button type="submit" className="btn btn-success" disabled={generatingKey} style={{ padding: '0.6rem 1rem' }}>
                  {generatingKey ? 'Generating...' : 'Create Key'}
                </button>
              </div>
            </form>
          </div>

          {/* Keys Registry list */}
          <div style={{
            background: 'var(--bg-glass)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-light)',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            {keysLoading ? (
              <p>Loading license keys...</p>
            ) : (
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '0.75rem' }}>License Key</th>
                    <th style={{ padding: '0.75rem' }}>Assigned To</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {licenseKeys.map(k => (
                    <tr key={k.key} style={{ borderBottom: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{k.key}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-primary)' }}>{k.email}</td>
                      <td style={{ padding: '0.75rem' }}>
                        {k.isUsed ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Activated
                          </span>
                        ) : (
                          <span style={{ color: 'var(--secondary-emerald)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                            Unused
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {licenseKeys.length === 0 && (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                        No license keys generated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;
