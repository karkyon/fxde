import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useInitAuth } from './hooks/useInitAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import TradesPage from './pages/Trades';
import TradeDetailPage from './pages/TradeDetail';
import SettingsPage from './pages/Settings';
import SignalsPage from './pages/Signals';

export default function App() {
  // ページリロード時にsessionStorage のトークン & user を復元
  useInitAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected – ProtectedRoute → Layout(Outlet) → 各ページ */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/trades/:id" element={<TradeDetailPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}