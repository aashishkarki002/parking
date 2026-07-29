import { BanknotesIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const BillingPage = () => {
  return (
    <PageShell title="Billing">
      <EmptyState
        icon={BanknotesIcon}
        title="No billing activity yet"
        description="Invoices and payments will show up here."
      />
    </PageShell>
  );
};

export default BillingPage;
