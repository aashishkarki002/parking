import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Building2, ChevronRight, Pencil, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/Pager';
import { cn } from '@/lib/utils';
import { GatePill, KpiTile, QuotaMeter, QuotaValue } from '@/components/tenants/primitives';
import { getInitials, type TenantRow, type Vendor } from '@/components/tenants/types';

const PAGE_SIZE = 10;

type GateFilter = 'all' | 'allowed' | 'blocked';
type SortKey = 'name' | 'cars' | 'bikes' | 'members';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

interface TenantDirectoryProps {
  rows: TenantRow[];
  onSelect: (key: string) => void;
  onEdit: (vendor: Vendor) => void;
}

// Level 1 of the tenant flow: every tenant (Vendor) with how much of its
// parking quota its members are consuming. Drilling into a row shows that
// tenant's members.
export function TenantDirectory({ rows, onSelect, onEdit }: TenantDirectoryProps) {
  const [search, setSearch] = useState('');
  const [gateFilter, setGateFilter] = useState<GateFilter>('all');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' });

  const stats = useMemo(() => {
    const tenants = rows.filter((r) => r.vendor).length;
    const gateAllowed = rows.filter((r) => r.vendor?.gate_access_allowed).length;
    const members = rows.reduce((sum, r) => sum + r.members.length, 0);
    const activeCards = rows.reduce((sum, r) => sum + r.activeCards, 0);
    const carsUsed = rows.reduce((sum, r) => sum + r.carsUsed, 0);
    const carQuota = rows.reduce((sum, r) => sum + r.carQuota, 0);
    const bikesUsed = rows.reduce((sum, r) => sum + r.bikesUsed, 0);
    const bikeQuota = rows.reduce((sum, r) => sum + r.bikeQuota, 0);
    return { tenants, gateAllowed, members, activeCards, carsUsed, carQuota, bikesUsed, bikeQuota };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (gateFilter === 'allowed' && !r.vendor?.gate_access_allowed) return false;
      if (gateFilter === 'blocked' && r.vendor?.gate_access_allowed !== false) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        (r.vendor?.location || '').toLowerCase().includes(term) ||
        (r.vendor?.contact_person || '').toLowerCase().includes(term) ||
        (r.vendor?.contact_email || '').toLowerCase().includes(term) ||
        r.members.some(
          (m) =>
            m.name.toLowerCase().includes(term) || m.license_plate.toLowerCase().includes(term)
        )
      );
    });
  }, [rows, search, gateFilter]);

  const sorted = useMemo(() => {
    const value = (r: TenantRow): string | number => {
      switch (sort.key) {
        case 'cars':
          return r.carQuota ? r.carsUsed / r.carQuota : r.carsUsed;
        case 'bikes':
          return r.bikeQuota ? r.bikesUsed / r.bikeQuota : r.bikesUsed;
        case 'members':
          return r.members.length;
        default:
          return r.name.toLowerCase();
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    // "Unassigned members" isn't a tenant, so it always sinks to the bottom.
    return [...filtered].sort((a, b) => {
      if (!a.vendor !== !b.vendor) return a.vendor ? -1 : 1;
      const av = value(a);
      const bv = value(b);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) => {
    // Numbers start descending (fullest first) — that's what people sort them for.
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
    setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  // A zero quota means EasyManage has not pushed one yet, so the utilization
  // reading is suppressed rather than shown as 100%/undefined.
  const slotsCaption = (used: number, quota: number) => {
    if (quota === 0) return 'No quota synced';
    if (used > quota) return `${used - quota} over quota`;
    return `${quota - used} free · ${Math.round((used / quota) * 100)}% used`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <KpiTile
          label="Tenants"
          value={stats.tenants}
          caption={`${stats.gateAllowed} allowed · ${stats.tenants - stats.gateAllowed} blocked at gate`}
        />
        <KpiTile
          label="Registered vehicles"
          value={stats.members}
          caption={`${stats.activeCards} active cards`}
        />
        <KpiTile
          label="Cars registered"
          value={<QuotaValue used={stats.carsUsed} quota={stats.carQuota} />}
          caption={slotsCaption(stats.carsUsed, stats.carQuota)}
        />
        <KpiTile
          label="Bikes registered"
          value={<QuotaValue used={stats.bikesUsed} quota={stats.bikeQuota} />}
          caption={slotsCaption(stats.bikesUsed, stats.bikeQuota)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search tenant, contact, member, plate…"
            className="pl-8"
          />
        </div>
        <SegmentedControl
          value={gateFilter}
          onChange={(value) => {
            setGateFilter(value);
            setPage(0);
          }}
          options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'allowed', label: 'Allowed', count: stats.gateAllowed },
            { value: 'blocked', label: 'Blocked', count: stats.tenants - stats.gateAllowed },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <SortHeader label="Tenant" sortKey="name" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <SortHeader label="Cars" sortKey="cars" sort={sort} onSort={toggleSort} />
              <SortHeader label="Bikes" sortKey="bikes" sort={sort} onSort={toggleSort} />
              <SortHeader label="Members" sortKey="members" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-medium">Allowance</th>
              <th className="px-3 py-2.5 font-medium">Gate</th>
              <th className="w-px px-3 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.key}
                tabIndex={0}
                onClick={() => onSelect(row.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(row.key);
                }}
                className="group cursor-pointer border-b border-border transition-colors duration-100 last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none active:bg-muted/70"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-foreground">
                      {row.vendor ? getInitials(row.name) : <Building2 className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[220px] truncate font-semibold text-foreground">{row.name}</span>
                      {row.vendor?.location && (
                        <span className="block max-w-[220px] truncate text-[11px] text-muted-foreground">
                          {row.vendor.location}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor?.contact_person || row.vendor?.contact_email ? (
                    <span className="min-w-0">
                      <span className="block max-w-[200px] truncate text-foreground">
                        {row.vendor.contact_person || '—'}
                      </span>
                      {row.vendor.contact_email && (
                        <a
                          href={`mailto:${row.vendor.contact_email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block max-w-[200px] truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
                        >
                          {row.vendor.contact_email}
                        </a>
                      )}
                    </span>
                  ) : row.vendor ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(row.vendor!);
                      }}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      Add contact
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? (
                    <QuotaMeter used={row.carsUsed} quota={row.carQuota} />
                  ) : (
                    <span className="font-mono text-[13px] tabular-nums text-foreground">{row.carsUsed}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? (
                    <QuotaMeter used={row.bikesUsed} quota={row.bikeQuota} />
                  ) : (
                    <span className="font-mono text-[13px] tabular-nums text-foreground">{row.bikesUsed}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[13px] tabular-nums text-foreground">{row.members.length}</span>
                  <span className="block text-[11px] whitespace-nowrap text-muted-foreground">
                    {row.monthlyPasses > 0 ? `${row.monthlyPasses} monthly` : `${row.activeCards} active`}
                    {row.expiringSoon > 0 && (
                      <span className="text-amber-600 dark:text-amber-400"> · {row.expiringSoon} expiring</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? (
                    <span className="text-[13px] whitespace-nowrap tabular-nums text-foreground">
                      {row.vendor.stamp_free_minutes} min
                      <span className="text-muted-foreground"> / stamp</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {row.vendor.tenant_free_hours != null
                          ? `${row.vendor.tenant_free_hours} h free parking`
                          : 'Default free parking'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? (
                    <GatePill allowed={row.vendor.gate_access_allowed} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {row.vendor && (
                      <RowAction
                        label={`Edit ${row.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(row.vendor!);
                        }}
                        className="opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </RowAction>
                    )}
                    <ChevronRight
                      aria-hidden
                      className="h-4 w-4 text-muted-foreground/50 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-muted-foreground motion-reduce:transition-none"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No tenants match this search.
                  {(search || gateFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setGateFilter('all');
                        setPage(0);
                      }}
                      className="ml-1.5 font-medium text-primary hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={clampedPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className="px-3 py-2.5 font-medium"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          active && 'text-foreground'
        )}
      >
        {label}
        <Arrow className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-0')} />
      </button>
    </th>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count: number }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex w-fit rounded-lg bg-muted p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium outline-none',
              'transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
              'focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
            <span className="tabular-nums text-muted-foreground">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function RowAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none',
        'transition-[background-color,color,opacity,transform] duration-150 ease-out',
        'hover:bg-background hover:text-foreground active:scale-[0.92] motion-reduce:active:scale-100',
        'focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {children}
    </button>
  );
}
