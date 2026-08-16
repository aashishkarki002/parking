import { Navigate, Route, Routes } from 'react-router-dom';
import RootPage from './pages/RootPage';
import DashboardPage from './pages/DashboardPage';
import PropertiesPage from './pages/PropertiesPage';
import SessionsPage from './pages/SessionsPage';
import TenantsPage from './pages/TenantsPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import BillingPage from './pages/BillingPage';
import StatementsPage from './pages/StatementsPage';
import MaintenancePage from './pages/MaintenancePage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/properties" element={<PropertiesPage />} />
      <Route path="/sessions" element={<SessionsPage />} />
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/subscription" element={<SubscriptionsPage />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/statements" element={<StatementsPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
