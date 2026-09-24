import dayjs from 'dayjs';
import { formatAmount, formatMinutes, type TenantStatementRow } from './types';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

// The statement is printed from a detached window rather than the current one:
// the app shell renders inside a SidebarProvider with its own layout and print
// rules (see index.css), and a self-contained document is far easier to keep
// looking like a document than one carved out of the running page.
export function printTenantStatement(
  row: TenantStatementRow,
  periodLabel: string,
  companyName: string
) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;

  const lines = row.visits
    .map((v) => {
      const shared =
        v.stamperNames.length > 1
          ? `<span class="tag">shared · ${v.stamperNames.length} stamps</span>`
          : '';
      return `<tr>
        <td class="mono">${escapeHtml(v.ticket)}${shared}</td>
        <td class="mono">${escapeHtml(v.plate)}</td>
        <td>${escapeHtml(dayjs(v.entry).format('DD MMM, hh:mm a'))}</td>
        <td>${escapeHtml(v.exit ? dayjs(v.exit).format('DD MMM, hh:mm a') : '—')}</td>
        <td class="num">${escapeHtml(formatMinutes(v.stayedMinutes))}</td>
        <td class="num">${escapeHtml(formatMinutes(v.freeMinutes))}</td>
        <td class="num">${v.overageMinutes > 0 ? escapeHtml(formatMinutes(v.overageMinutes)) : '—'}</td>
        <td class="num strong">${v.amount > 0 ? escapeHtml(formatAmount(v.amount)) : '—'}</td>
      </tr>`;
    })
    .join('');

  const contact = [row.vendor?.contact_person, row.vendor?.contact_email, row.vendor?.location]
    .filter(Boolean)
    .map((s) => escapeHtml(String(s)))
    .join(' · ');

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(row.name)} — ${escapeHtml(periodLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  .muted { color: #666; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; gap: 24px; }
  .totals { display: flex; gap: 28px; margin-bottom: 18px; }
  .totals div span { display: block; }
  .totals .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: #666; }
  .totals .v { font-size: 18px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: #666; border-bottom: 1px solid #ccc; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .strong { font-weight: 600; }
  .tag { display: inline-block; margin-left: 6px; padding: 1px 5px; border: 1px solid #ddd; border-radius: 8px; font-size: 9px; color: #666; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; padding-top: 8px; }
  .note { margin-top: 22px; font-size: 10.5px; color: #666; border-top: 1px solid #eee; padding-top: 10px; }
  @page { margin: 14mm; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>${escapeHtml(row.name)}</h1>
      <div class="muted">${contact || 'Guest parking statement'}</div>
    </div>
    <div style="text-align:right">
      <div class="strong">${escapeHtml(companyName)}</div>
      <div class="muted">Guest parking statement</div>
      <div class="muted">${escapeHtml(periodLabel)}</div>
      <div class="muted">Generated ${escapeHtml(dayjs().format('DD MMM YYYY, hh:mm a'))}</div>
    </div>
  </div>

  <div class="totals">
    <div><span class="k">Guests hosted</span><span class="v">${row.guests}</span></div>
    <div><span class="k">Overstays</span><span class="v">${row.overstays}</span></div>
    <div><span class="k">Overage time</span><span class="v">${escapeHtml(formatMinutes(row.overageMinutes))}</span></div>
    <div><span class="k">Amount due</span><span class="v">${escapeHtml(formatAmount(row.amount))}</span></div>
  </div>

  <table>
    <thead><tr>
      <th>Ticket</th><th>Plate</th><th>In</th><th>Out</th>
      <th class="num">Stayed</th><th class="num">Free</th><th class="num">Over</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>${lines || '<tr><td colspan="8" class="muted" style="padding:16px 8px">No guest visits in this period.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="6"></td>
      <td class="num">${escapeHtml(formatMinutes(row.overageMinutes))}</td>
      <td class="num">${escapeHtml(formatAmount(row.amount))}</td>
    </tr></tfoot>
  </table>

  <div class="note">
    Guests are charged to the tenant only for time parked beyond the free minutes granted by the
    ticket's stamps. A ticket stamped by more than one tenant is listed for each of them but billed
    once, to the tenant who stamped it last. Visits still in progress are not included.
  </div>
</body></html>`);
  win.document.close();
  win.focus();
  // Give the detached document a beat to lay out before the print dialog
  // measures it, the same wait the ticket printer uses.
  setTimeout(() => win.print(), 300);
  return true;
}
