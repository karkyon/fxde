import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import { useInitAuth } from './hooks/useInitAuth';

import DashboardPage from './pages/Dashboard';
import LoginPage from './pages/Login';
import SettingsPage from './pages/Settings';
import SignalsPage from './pages/Signals';
import TradeDetailPage from './pages/TradeDetail';
import TradesPage from './pages/Trades';

export default function App() {
  useInitAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

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

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}