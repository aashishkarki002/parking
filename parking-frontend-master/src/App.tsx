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
import ProfilePage from './pages/ProfilePage';
import PricingPlansPage from './pages/PricingPlansPage';
import VehicleTypesPage from './pages/VehicleTypesPage';
import ManageOperatorsPage from './pages/ManageOperatorsPage';

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
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/pricing-plans" element={<PricingPlansPage />} />
      <Route path="/vehicle-types" element={<VehicleTypesPage />} />
      <Route path="/operators" element={<ManageOperatorsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
