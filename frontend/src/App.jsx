import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { Spin } from 'antd';
import MainLayout from './layouts/MainLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Sales from './pages/Sales.jsx';
import Payments from './pages/Payments.jsx';
import Policies from './pages/Policies.jsx';
import Smuggle from './pages/Smuggle.jsx';
import RebateTrial from './pages/RebateTrial.jsx';
import Batches from './pages/Batches.jsx';
import { Invoices, Distributors, PenaltyRules, RegionAuths } from './pages/_subpages.jsx';
import Audit from './pages/Audit.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><MainLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="payments" element={<Payments />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="policies" element={<Policies />} />
        <Route path="smuggle" element={<Smuggle />} />
        <Route path="rebate/trial" element={<RebateTrial />} />
        <Route path="batches" element={<Batches />} />
        <Route path="audit" element={<Audit />} />
        <Route path="distributors" element={<Distributors />} />
        <Route path="penalty-rules" element={<PenaltyRules />} />
        <Route path="region-auths" element={<RegionAuths />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
