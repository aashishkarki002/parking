import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMinutes, formatMoney, type TenantValidation } from '@/components/reports/metrics';

const COLLAPSED_ROWS = 8;

interface TenantValidationTableProps {
  tenants: TenantValidation[];
  currency: string;
}

/**
 * Who is stamping, how much parking they gave away, and what they owe for the
 * part their stamps did not cover — the tenant-side ledger of validation.
 */
export function TenantValidationTable({ tenants, currency }: TenantValidationTableProps) {
  const [expanded, setExpanded] = useState(false);

  if (tenants.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
        No tickets were validated in this period.
      </p>
    );
  }

  const rows = expanded ? tenants : tenants.slice(0, COLLAPSED_ROWS);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
              <th className="px-3 py-2.5">Tenant</th>
              <th className="px-3 py-2.5 text-right">Stamps</th>
              <th className="px-3 py-2.5 text-right">Free given</th>
              <th className="px-3 py-2.5 text-right">Overage</th>
              <th className="px-3 py-2.5 text-right">Billed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => (
              <tr key={tenant.vendor} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground">{tenant.vendor}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {tenant.sessionsValidated} validated
                    {tenant.overageSessions > 0 && ` · ${tenant.overageSessions} over`}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-foreground">
                  {tenant.stamps}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                  {formatMinutes(tenant.freeMinutesGranted)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-foreground">
                  {tenant.overageMinutes > 0 ? (
                    formatMinutes(tenant.overageMinutes)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {tenant.amountBilled > 0 ? (
                    formatMoney(tenant.amountBilled, currency)
                  ) : (
                    <span className="font-normal text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tenants.length > COLLAPSED_ROWS && (
        <Button variant="ghost" size="sm" className="self-center" onClick={() => setExpanded((o) => !o)}>
          <ChevronDown className={expanded ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} />
          {expanded ? 'Show fewer' : `Show all ${tenants.length} tenants`}
        </Button>
      )}
    </div>
  );
}
