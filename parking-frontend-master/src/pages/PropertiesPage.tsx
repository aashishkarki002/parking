import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const PropertiesPage = () => {
  return (
    <PageShell title="Properties">
      <EmptyState
        icon={BuildingOffice2Icon}
        title="No properties yet"
        description="Properties you add will show up here."
      />
    </PageShell>
  );
};

export default PropertiesPage;
