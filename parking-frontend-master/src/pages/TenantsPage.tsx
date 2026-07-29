import { UsersIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const TenantsPage = () => {
  return (
    <PageShell title="Tenants">
      <EmptyState
        icon={UsersIcon}
        title="No tenants yet"
        description="Tenants you add will show up here."
      />
    </PageShell>
  );
};

export default TenantsPage;
