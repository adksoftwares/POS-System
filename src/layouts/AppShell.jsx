import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, dbCloud } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useSyncManager } from '../hooks/useSyncManager';
import './AppShell.css';

export default function AppShell() {
  // Activate automatic background bidirectional synchronization engine reactively
  const syncConfig = useSyncManager();

  const location = useLocation();
  const navigate = useNavigate();
  const [shopName, setShopName] = useState("ADK Supermart");
  
  const role = localStorage.getItem('adk_role') || 'User';
  const orgId = syncConfig?.orgId || localStorage.getItem('adk_orgId');

  useEffect(() => {
    async function fetchOrg() {
      if (orgId && navigator.onLine) {
        try {
          const orgRef = doc(dbCloud, "Organizations", orgId);
          const snap = await getDoc(orgRef);
          if (snap.exists()) {
            setShopName(snap.data().shopName || "ADK Supermart");
          }
        } catch (e) {
          console.error("Could not fetch org name", e);
        }
      }
    }
    fetchOrg();
  }, [orgId]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("adk_role");
      localStorage.removeItem("adk_orgId");
      localStorage.removeItem("adk_branchId");
      localStorage.removeItem("adk_userEmail");
      navigate("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="header-left">
          <span className="shop-name">{shopName}</span>
          <nav className="header-nav">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>POS</Link>
            <Link to="/inventory" className={location.pathname === '/inventory' ? 'active' : ''}>Inventory</Link>
            <Link to="/analytics" className={location.pathname === '/analytics' ? 'active' : ''}>Analytics</Link>
            <Link to="/hr" className={location.pathname === '/hr' ? 'active' : ''}>HR Timesheets</Link>
            <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}>Settings</Link>
          </nav>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="user-role">Role: <strong>{role}</strong></span>
          <button className="btn btn-danger" onClick={handleLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>Logout</button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="global-footer">
        Powered by ADK Software Solutions
      </footer>
    </div>
  );
}
