import { UserGroupIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const ManageOperatorsPage = () => {
  return (
    <PageShell title="Manage operators">
      <EmptyState
        icon={UserGroupIcon}
        title="No operators yet"
        description="Staff who can operate the parking desk will show up here."
      />
    </PageShell>
  );
};

export default ManageOperatorsPage;
