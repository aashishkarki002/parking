import { TruckIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const VehicleTypesPage = () => {
  return (
    <PageShell title="Vehicle types">
      <EmptyState
        icon={TruckIcon}
        title="No vehicle types yet"
        description="Vehicle categories and their rates will show up here."
      />
    </PageShell>
  );
};

export default VehicleTypesPage;
