import { Navigate, Route, Routes } from 'react-router-dom';
import RootPage from './pages/RootPage';
import DashboardPage from './pages/DashboardPage';
import PropertiesPage from './pages/PropertiesPage';
import SessionsPage from './pages/SessionsPage';
import TenantsPage from './pages/TenantsPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import BillingPage from './pages/BillingPage';
import StatementsPage from './pages/StatementsPage';
import ProfilePage from './pages/ProfilePage';
import PricingPlansPage from './pages/PricingPlansPage';
import VehicleTypesPage from './pages/VehicleTypesPage';
import ManageOperatorsPage from './pages/ManageOperatorsPage';
import ReportsPage from './pages/ReportsPage';
import RfidTodayPage from './pages/RfidTodayPage';
import IdentifyCardPage from './pages/IdentifyCardPage';
import MaintenancePage from './pages/MaintenancePage';
import { RequireRole } from './components/RequireRole';
import { ROLE_ADMIN, ROLE_POS, ROLE_SUPERADMIN } from './lib/public/roles';

const ADMIN_UP = [ROLE_ADMIN, ROLE_SUPERADMIN];
const POS_UP = [ROLE_POS, ROLE_ADMIN, ROLE_SUPERADMIN];

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootPage />} />
      <Route path="/dashboard" element={<RequireRole roles={ADMIN_UP}><DashboardPage /></RequireRole>} />
      <Route path="/reports" element={<RequireRole roles={ADMIN_UP}><ReportsPage /></RequireRole>} />
      <Route path="/properties" element={<RequireRole roles={ADMIN_UP}><PropertiesPage /></RequireRole>} />
      <Route path="/sessions" element={<RequireRole roles={POS_UP}><SessionsPage /></RequireRole>} />
      <Route path="/tenant-gate-today" element={<RequireRole roles={POS_UP}><RfidTodayPage /></RequireRole>} />
      <Route path="/identify-card" element={<RequireRole roles={POS_UP}><IdentifyCardPage /></RequireRole>} />
      <Route path="/tenants" element={<RequireRole roles={ADMIN_UP}><TenantsPage /></RequireRole>} />
      <Route path="/subscription" element={<RequireRole roles={ADMIN_UP}><SubscriptionsPage /></RequireRole>} />
      <Route path="/billing" element={<RequireRole roles={ADMIN_UP}><BillingPage /></RequireRole>} />
      <Route path="/statements" element={<RequireRole roles={ADMIN_UP}><StatementsPage /></RequireRole>} />
      <Route path="/maintenance" element={<RequireRole roles={ADMIN_UP}><MaintenancePage /></RequireRole>} />
      <Route path="/profile" element={<RequireRole><ProfilePage /></RequireRole>} />
      <Route path="/pricing-plans" element={<RequireRole roles={ADMIN_UP}><PricingPlansPage /></RequireRole>} />
      <Route path="/vehicle-types" element={<RequireRole roles={ADMIN_UP}><VehicleTypesPage /></RequireRole>} />
      <Route path="/operators" element={<RequireRole roles={[ROLE_SUPERADMIN]}><ManageOperatorsPage /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
