import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, ShoppingCart, Package, BarChart3, Users, Settings, Shield, Menu, X } from 'lucide-react';
import { auth, dbCloud } from '../config/firebase';
import { db } from '../db/database';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useSyncManager } from '../hooks/useSyncManager';
import './AppShell.css';

export default function AppShell() {
  // Activate automatic background bidirectional synchronization engine reactively
  const syncConfig = useSyncManager();

  useEffect(() => {
    async function initUpdater() {
      try {
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        await CapacitorUpdater.notifyAppReady();
      } catch (e) {
        // Not running in Capacitor or plugin not loaded, ignore
      }
    }
    initUpdater();

    // Custom GitHub Auto-Update Check for Android APK
    async function checkGitHubUpdates() {
      try {
        const res = await fetch('https://api.github.com/repos/adksoftwares/POS-System/releases/latest');
        if (!res.ok) return;
        const data = await res.json();
        const latestVersion = data.tag_name.replace('v', '');
        const currentVersion = '1.0.3'; // App Version
        
        if (latestVersion !== currentVersion && latestVersion > currentVersion) {
          const apkAsset = data.assets.find(a => a.name.endsWith('.apk'));
          if (apkAsset) {
            const wantUpdate = window.confirm(`A new Android App update (v${latestVersion}) is available!\n\nDo you want to download and install it now?`);
            if (wantUpdate) {
              window.open(apkAsset.browser_download_url, '_system');
            }
          }
        }
      } catch (err) {
        console.error("GitHub Update Check Failed:", err);
      }
    }

    // Only run custom GitHub check on Android, because Electron handles Windows automatically
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      setTimeout(checkGitHubUpdates, 5000);
    }
  }, []);

  const location = useLocation();
  const navigate = useNavigate();
  const [shopName, setShopName] = useState("ADK Supermart");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const openMobileMenu = async () => {
    setIsMobileMenuOpen(true);
    try {
      const { App: CapApp } = await import('@capacitor/app');
      window.posMenuBackListener = await CapApp.addListener('backButton', () => {
        closeMobileMenu();
      });
    } catch (e) {
      window.history.pushState({ mobileMenuOpen: true }, '', window.location.href);
    }
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    if (window.posMenuBackListener) {
      window.posMenuBackListener.remove();
      window.posMenuBackListener = null;
    }
    if (window.history.state && window.history.state.mobileMenuOpen) {
      window.history.back();
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setIsMobileMenuOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
            let effectiveTier = data.subscriptionTier || 'Free';
            if (data.premium_expiry_date) {
              const expiryDate = new Date(data.premium_expiry_date);
              if (new Date() > expiryDate) {
                effectiveTier = 'Free';
              } else {
                effectiveTier = 'Premium';
              }
            }
            setTier(effectiveTier);
          }
        } catch (e) {
          console.error("Could not fetch org name", e);
        }
      }
    }
    fetchOrg();

    const handleShopUpdate = (e) => {
      if (e.detail && e.detail.shopName) {
        setShopName(e.detail.shopName);
      }
    };
    window.addEventListener('shopDetailsUpdated', handleShopUpdate);
    
    return () => {
      window.removeEventListener('shopDetailsUpdated', handleShopUpdate);
    };
  }, [orgId]);

  const hasPremium = isSuperAdmin || tier === "Premium";
  const roleDisplay = isSuperAdmin ? "Super Admin" : (hasPremium ? "Premium " + role : role);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      try {
        await Promise.all(db.tables.map(table => table.clear()));
      } catch (dbErr) {
        console.error("Error clearing Dexie tables on logout:", dbErr);
      }
      localStorage.clear();
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
              padding: '0.35rem 0.6rem', 
              borderRadius: '6px', 
              background: 'rgba(255, 255, 255, 0.1)', 
              border: '1px solid rgba(255, 255, 255, 0.15)', 
              color: '#ffffff', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <span className="user-role">Role: <strong>{roleDisplay}</strong></span>
          <button className="btn btn-danger desktop-logout-btn" onClick={handleLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>Logout</button>
          
          <button 
            className="mobile-hamburger-btn" 
            onClick={openMobileMenu}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              padding: '0.25rem',
              cursor: 'pointer'
            }}
          >
            <Menu size={24} />
          </button>
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

      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="mobile-sidebar-overlay" onClick={closeMobileMenu}>
            <motion.div 
              className="mobile-sidebar"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="mobile-sidebar-header">
                <span className="shop-name-sidebar">{shopName}</span>
                <button className="close-sidebar-btn" onClick={closeMobileMenu}>
                  <X size={24} />
                </button>
              </div>
              <div className="mobile-sidebar-content">
                <Link to="/" className={`sidebar-link ${location.pathname === '/' ? 'active' : ''}`} onClick={closeMobileMenu}>
                  <ShoppingCart size={20} /> POS
                </Link>
                <Link to="/inventory" className={`sidebar-link ${location.pathname === '/inventory' ? 'active' : ''}`} onClick={closeMobileMenu}>
                  <Package size={20} /> Inventory
                </Link>
                <Link to="/analytics" className={`sidebar-link ${location.pathname === '/analytics' ? 'active' : ''}`} onClick={closeMobileMenu}>
                  <BarChart3 size={20} /> Analytics
                </Link>
                <Link to="/hr" className={`sidebar-link ${location.pathname === '/hr' ? 'active' : ''}`} onClick={closeMobileMenu}>
                  <Users size={20} /> HR Timesheets
                </Link>
                <Link to="/settings" className={`sidebar-link ${location.pathname === '/settings' ? 'active' : ''}`} onClick={closeMobileMenu}>
                  <Settings size={20} /> Settings
                </Link>
                {isSuperAdmin && (
                  <Link to="/admin" className={`sidebar-link ${location.pathname === '/admin' ? 'active' : ''}`} onClick={closeMobileMenu}>
                    <Shield size={20} /> Admin
                  </Link>
                )}
                
                <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
                  <button className="btn btn-danger" onClick={handleLogout} style={{ width: '100%', padding: '0.75rem', fontWeight: 'bold' }}>
                    Logout
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="global-footer">
        Powered by ADK Software Solutions
      </footer>
    </div>
  );
}
