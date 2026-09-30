import LoginForm from '@/app/(public)/_login/_components/LoginForm';
import Options from '@/app/(public)/(pages)/home/_components/Options';
import Header from '@/components/pComponents/layout/header/Header';
import Footer from '@/components/pComponents/layout/footer/Footer';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { Navigate } from 'react-router-dom';
import { isTenantUser, TENANT_PORTAL } from '@/lib/public/roles';

const RootPage = () => {
  const loginState = useAppSelector(loginSelector);
  const { isLoggedIn } = loginState;

  // Unauthenticated view: same layout as Next.js public login page
  if (!isLoggedIn) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '1080px',
          margin: 'auto',
        }}
      >
        <LoginForm />
      </div>
    );
  }

  // The POS screen is staff-only; a tenant login has its own portal.
  if (isTenantUser(loginState)) {
    return <Navigate to={TENANT_PORTAL} replace />;
  }

  // Authenticated view: same structure as Next.js public (pages) layout
  return (
    <div className="publicBody bgColor">
      <Header />
      <div className="main">
        <Options />
      </div>
      <Footer />
    </div>
  );
};

export default RootPage;

