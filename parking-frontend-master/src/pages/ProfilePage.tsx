import { UserCircleIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const ProfilePage = () => {
  return (
    <PageShell title="My profile">
      <EmptyState
        icon={UserCircleIcon}
        title="Profile settings coming soon"
        description="Your account details and preferences will show up here."
      />
    </PageShell>
  );
};

export default ProfilePage;
