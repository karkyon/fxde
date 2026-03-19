/**
 * apps/web/src/App.tsx
 *
 * 変更理由:
 *   - createBrowserRouter + RouterProvider に変更（SPEC_v51_part5 §1.4 準拠）
 *   - stores/auth.store → stores/auth.store に変更
 *   - 廃止ルート（/patterns, /validation, /pairs, /signals）削除
 *   - 正規ルート追加: /strategy, /prediction, /chart, /plan
 *   - /prediction は PRO | PRO_PLUS | ADMIN のみアクセス可能（RolesGuard）
 *   - ページ import に Strategy, Prediction, Chart, Plan を追加
 *
 * 参照仕様: SPEC_v51_part5 §1.4「React Router 構成（確定）」
 *           SPEC_v51_part10「フロントディレクトリ構成（確定）」
 */

import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { useInitAuth }  from './hooks/useInitAuth';
import Layout           from './components/layout/Layout';
import PluginDrilldownPage from './pages/PluginDrilldown';

// ── ページ（遅延ロード対象と即時ロード対象の分離）────────────────────────
import LoginPage    from './pages/Login';
import RegisterPage from './pages/Register';
import DashboardPage from './pages/Dashboard';
import TradesPage   from './pages/Trades';
import StrategyPage from './pages/Strategy';
import SettingsPage from './pages/Settings';
import PlanPage     from './pages/Plan';
import ChartPage    from './pages/Chart';
import NotFoundPage from './pages/NotFound';
import ReliabilityLabPage from './pages/ReliabilityLab';
import ResearchEventsPage      from './pages/ResearchEvents';
import ResearchCombinationsPage from './pages/ResearchCombinations';
import ResearchJobsPage        from './pages/ResearchJobs';

// PRO | PRO_PLUS | ADMIN のみ（遅延ロード）
const PredictionPage = lazy(() => import('./pages/Prediction'));

// ── 認証ガードラッパー ────────────────────────────────────────────────────
function AuthLayout() {
  return <Outlet />;
}

function PrivateLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized   = useAuthStore((s) => s.isInitialized);

  if (!isInitialized) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1117',
        color: '#cbd5e1',
        fontSize: 14,
      }}>
        認証状態を確認しています...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

// ── PRO ガードラッパー ────────────────────────────────────────────────────
// 参照: SPEC_v51_part6 §1 RBAC / SPEC_v51_part5 §1.4
const ROLES_PRO_OR_ABOVE = ['PRO', 'PRO_PLUS', 'ADMIN'] as const;

function ProGuard() {
  const user = useAuthStore((s) => s.user);
  const hasPro = user && (ROLES_PRO_OR_ABOVE as readonly string[]).includes(user.role);
  if (!hasPro) {
    // 未認可ロールには誘導ページを表示（仕様では誘導モーダルだが、ここではリダイレクト）
    return <Navigate to="/plan" replace />;
  }
  return <Outlet />;
}

// ── Router 定義 ───────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // 認証ページ（未ログイン）
  {
    element: <AuthLayout />,
    children: [
      { path: '/login',    element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  // プライベートページ（ログイン必須）
  {
    element: <PrivateLayout />,
    children: [
      { index: true,          element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard',   element: <DashboardPage /> },
      { path: '/trades',      element: <TradesPage /> },
      { path: '/strategy',    element: <StrategyPage /> },
      { path: '/chart',       element: <ChartPage /> },
      { path: '/settings',    element: <SettingsPage /> },
      { path: '/plan',        element: <PlanPage /> },
      { path: '/research/plugins',             element: <ReliabilityLabPage /> },
      { path: '/research/plugins/:pluginKey',  element: <PluginDrilldownPage /> },
      { path: '/research/events',              element: <ResearchEventsPage /> },
      { path: '/research/combinations',        element: <ResearchCombinationsPage /> },
      { path: '/research/jobs',                element: <ResearchJobsPage /> },
      // PRO | PRO_PLUS | ADMIN のみ
      {
        element: <ProGuard />,
        children: [
          {
            path: '/prediction',
            element: (
              <Suspense fallback={<div style={{ color: '#cbd5e1' }}>読み込み中...</div>}>
                <PredictionPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
  // 廃止ルート（旧 /patterns, /validation, /pairs, /signals は定義しない）
  { path: '*', element: <NotFoundPage /> },
]);

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  useInitAuth();
  return <RouterProvider router={router} />;
}