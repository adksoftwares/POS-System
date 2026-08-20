import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import PosScreen from './components/PosScreen';
import InventoryScreen from './components/InventoryScreen';
import SettingsScreen from './components/SettingsScreen';
import AnalyticsScreen from './components/AnalyticsScreen';
import HrScreen from './components/HrScreen';
import AdminDashboard from './components/AdminDashboard';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import ErrorBoundary from './components/ErrorBoundary';
import StandaloneCart from './components/StandaloneCart';
import './App.css';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import { Toaster } from 'react-hot-toast';

// Authentic Firebase Auth Guard protecting all routes and preventing zombie sessions
const ProtectedRoute = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--bg-primary)',
        fontFamily: 'var(--font-sans)'
      }}>
        <div style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: 'var(--text-primary)',
          marginBottom: '0.5rem',
          background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          ADK Smart POS
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Verifying secure cloud session...
        </div>
        <div className="skeleton" style={{ marginTop: '2rem', height: '4px', width: '200px', borderRadius: '2px' }}></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {

  return (
    <ErrorBoundary>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-glass)', color: 'var(--text-primary)', backdropFilter: 'blur(10px)' } }} />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/cart-view" element={
            <ProtectedRoute>
              <StandaloneCart />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>
            <Route index element={<PosScreen />} />
            <Route path="inventory" element={<InventoryScreen />} />
            <Route path="settings" element={<SettingsScreen />} />
            <Route path="analytics" element={<AnalyticsScreen />} />
            <Route path="hr" element={<HrScreen />} />
            <Route path="admin" element={<AdminDashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;

