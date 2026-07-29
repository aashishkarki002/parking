import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const MaintenancePage = () => {
  return (
    <PageShell title="Maintenance">
      <EmptyState
        icon={WrenchScrewdriverIcon}
        title="No maintenance requests yet"
        description="Maintenance requests will show up here."
      />
    </PageShell>
  );
};

export default MaintenancePage;
