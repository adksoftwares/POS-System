import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import PosScreen from './components/PosScreen';
import InventoryScreen from './components/InventoryScreen';
import SettingsScreen from './components/SettingsScreen';
import AnalyticsScreen from './components/AnalyticsScreen';
import HrScreen from './components/HrScreen';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import './App.css';

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';

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
        backgroundColor: '#f1f5f9',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: '#1e293b',
          marginBottom: '0.5rem'
        }}>
          ADK Smart POS
        </div>
        <div style={{ color: '#64748b', fontSize: '0.95rem' }}>
          Verifying secure cloud session...
        </div>
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
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        
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
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;

