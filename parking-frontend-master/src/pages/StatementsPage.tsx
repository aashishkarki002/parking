import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const StatementsPage = () => {
  return (
    <PageShell title="Statements">
      <EmptyState
        icon={DocumentTextIcon}
        title="No statements yet"
        description="Generated statements will show up here."
      />
    </PageShell>
  );
};

export default StatementsPage;
