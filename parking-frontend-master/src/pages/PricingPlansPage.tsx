import { TagIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';

const PricingPlansPage = () => {
  return (
    <PageShell title="Pricing plans">
      <EmptyState
        icon={TagIcon}
        title="No pricing plans yet"
        description="Hourly rates and subscription plans you set up will show up here."
      />
    </PageShell>
  );
};

export default PricingPlansPage;
