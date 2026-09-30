import { useState } from 'react';
import { InformationCircleIcon, MagnifyingGlassIcon, TruckIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { useGetMyVehiclesQuery, type TenantVehicle } from '@/components/tenant/vehiclesApi';

type Filter = 'ALL' | 'CAR' | 'BIKE' | 'INACTIVE';

const FILTERS: { value: Filter; label: string; match: (v: TenantVehicle) => boolean }[] = [
  { value: 'ALL', label: 'All', match: () => true },
  { value: 'CAR', label: 'Cars', match: (v) => v.vehicle_category === 'CAR' },
  { value: 'BIKE', label: 'Bikes', match: (v) => v.vehicle_category === 'BIKE' },
  { value: 'INACTIVE', label: 'Card inactive', match: (v) => !v.is_card_active },
];

const TenantVehiclesPage = () => {
  const { currentUser } = useAppSelector(loginSelector);
  const vendor = currentUser?.vendor;
  const { data = [], isLoading } = useGetMyVehiclesQuery();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  // Plates are stored without spaces; names keep theirs.
  const term = search.trim().toLowerCase();
  const plateTerm = term.replace(/\s+/g, '');
  const matchFilter = FILTERS.find((f) => f.value === filter)!.match;
  const rows = data.filter(
    (v) => matchFilter(v) && (!term || v.name.toLowerCase().includes(term) || v.license_plate.toLowerCase().includes(plateTerm))
  );

  let body;
  if (isLoading) {
    body = (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  } else if (!data.length) {
    body = (
      <EmptyState
        icon={TruckIcon}
        title="No vehicles registered"
        description="Vehicles the parking office registers for your company show up here."
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search name or vehicle number"
              aria-label="Search vehicles"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div role="radiogroup" aria-label="Filter vehicles" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {FILTERS.map((f) => {
              const count = data.filter(f.match).length;
              const active = filter === f.value;
              if (f.value === 'INACTIVE' && !count) return null;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring/50',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground/70 hover:bg-muted hover:text-foreground'
                  )}
                >
                  {f.label}
                  <span className={cn('tabular-nums', active ? 'text-background/70' : 'text-muted-foreground')}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs uppercase hover:bg-muted/40">
                <TableHead className="px-4">Name</TableHead>
                <TableHead className="px-4">Vehicle</TableHead>
                <TableHead className="px-4 text-right">Card</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="py-12 text-center text-sm text-muted-foreground">
                    {term ? `No vehicles match “${search.trim()}”.` : 'No vehicles in this view.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((v) => (
                <TableRow key={v.id} className={cn(!v.is_card_active && 'text-muted-foreground')}>
                  <TableCell className="px-4 py-3.5 text-[13.5px] font-semibold tracking-[-0.005em] text-foreground">
                    {v.name}
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-block rounded-md border border-border bg-background px-2 py-1 font-mono text-[12.5px] leading-none tracking-wide text-foreground shadow-[0_1px_0_var(--border)]">
                        {v.license_plate}
                      </span>
                      {v.vehicle_type && <span className="text-[12px] text-muted-foreground">{v.vehicle_type}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[12px] font-medium',
                        v.is_card_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn('size-1.5 rounded-full', v.is_card_active ? 'bg-emerald-500' : 'bg-muted-foreground/50')}
                        aria-hidden
                      />
                      {v.is_card_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="flex gap-2.5 rounded-xl bg-secondary/60 px-4 py-3 text-[13px] leading-5 text-secondary-foreground">
          <InformationCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            These vehicles park under your company's tenant rules. To add, remove or change a vehicle, contact the
            parking office.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageShell title="Company vehicles">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-1.5">
          {vendor && <p className="text-[12px] font-semibold tracking-[0.06em] text-primary uppercase">{vendor.name}</p>}
          <h2 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-[28px]">
            {isLoading ? 'Registered vehicles' : `${data.length} registered vehicle${data.length === 1 ? '' : 's'}`}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Your company's vehicles and whether their parking card works at the gate.
          </p>
        </header>
        {body}
      </div>
    </PageShell>
  );
};

export default TenantVehiclesPage;
