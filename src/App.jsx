import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import InstrumentsPage from './pages/InstrumentsPage.jsx';
import TestsPage from './pages/TestsPage.jsx';
import NewTestPage from './pages/NewTestPage.jsx';
import TestDetailPage from './pages/TestDetailPage.jsx';
import VerifyPage from './pages/VerifyPage.jsx';

function ProtectedLayout() {
  const { user } = useAuth();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/instruments" element={<InstrumentsPage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/tests/new" element={<NewTestPage />} />
        <Route path="/tests/:id" element={<TestDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
