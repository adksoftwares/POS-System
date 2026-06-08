import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, ShoppingCart, Package, Truck, BarChart3, Users, Settings, Shield } from 'lucide-react';
import { auth, dbCloud } from '../config/firebase';
import { db } from '../db/database';
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
  
  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('adk_theme') === 'dark' || 
           (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [tier, setTier] = useState("Free");
  const role = localStorage.getItem('adk_role') || 'User';
  const orgId = syncConfig?.orgId || localStorage.getItem('adk_orgId');
  const userEmail = localStorage.getItem('adk_userEmail') || '';
  const isSuperAdmin = userEmail.trim().toLowerCase() === 'arikarran14@gmail.com';

  useEffect(() => {
    async function fetchOrg() {
      if (orgId && navigator.onLine) {
        try {
          const orgRef = doc(dbCloud, "Organizations", orgId);
          const snap = await getDoc(orgRef);
          if (snap.exists()) {
            const data = snap.data();
            setShopName(data.shopName || "ADK Supermart");
            setTier(data.subscriptionTier || "Free");
          }
        } catch (e) {
          console.error("Could not fetch org name", e);
        }
      }
    }
    fetchOrg();
  }, [orgId]);

  const hasPremium = isSuperAdmin || tier === "Premium";
  const roleDisplay = isSuperAdmin ? "Super Admin" : (hasPremium ? "Premium " + role : role);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      try {
        await db.products.clear();
        await db.transactions.clear();
        await db.attendance_logs.clear();
        await db.suppliers.clear();
        await db.purchase_orders.clear();
      } catch (dbErr) {
        console.error("Error clearing Dexie tables on logout:", dbErr);
      }
      localStorage.removeItem("adk_role");
      localStorage.removeItem("adk_orgId");
      localStorage.removeItem("adk_branchId");
      localStorage.removeItem("adk_userEmail");
      navigate("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('adk_theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('adk_theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="header-left">
          <span className="shop-name">{shopName}</span>
          <nav className="header-nav">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
              <ShoppingCart size={16} /> POS
            </Link>
            <Link to="/inventory" className={location.pathname === '/inventory' ? 'active' : ''}>
              <Package size={16} /> Inventory
            </Link>
            <Link to="/suppliers" className={location.pathname === '/suppliers' ? 'active' : ''}>
              <Truck size={16} /> Suppliers
            </Link>
            <Link to="/analytics" className={location.pathname === '/analytics' ? 'active' : ''}>
              <BarChart3 size={16} /> Analytics
            </Link>
            <Link to="/hr" className={location.pathname === '/hr' ? 'active' : ''}>
              <Users size={16} /> HR Timesheets
            </Link>
            <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}>
              <Settings size={16} /> Settings
            </Link>
            {isSuperAdmin && (
              <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>
                <Shield size={16} /> Admin
              </Link>
            )}
          </nav>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={toggleTheme} 
            className="theme-toggle"
            title="Toggle Dark Mode"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', 
              color: 'var(--text-primary)', display: 'flex', alignItems: 'center'
            }}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <span className="user-role">Role: <strong>{roleDisplay}</strong></span>
          <button className="btn btn-danger" onClick={handleLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>Logout</button>
        </div>
      </header>

      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100%', width: '100%' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="global-footer">
        Powered by ADK Software Solutions
      </footer>
    </div>
  );
}
