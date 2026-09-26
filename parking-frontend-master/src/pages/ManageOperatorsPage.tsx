import { useMemo, useState } from 'react';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile, StatusPill } from '@/components/tenants/primitives';
import { ConfirmDeleteDialog } from '@/components/settings/ConfirmDeleteDialog';
import { OperatorDialog } from '@/components/operators/OperatorDialog';
import { OPERATOR_ROLES, roleLabel, type Operator } from '@/components/operators/types';
import {
  useDeleteOperatorMutation,
  useGetOperatorsQuery,
} from '@/app/(public)/(pages)/operators/_redux/api';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';

const NONE: never[] = [];

// Operators are login accounts for the parking desk (pos/admin/superadmin),
// not the tenant/vehicle "Staff" records managed on the Tenants screen — see
// user_app/roles.py and management/permissions.py for the tier semantics.
const ManageOperatorsPage = () => {
  const { data, isLoading, isError } = useGetOperatorsQuery(undefined);
  const [deleteOperator, { isLoading: deleting }] = useDeleteOperatorMutation();
  const loginState = useAppSelector(loginSelector);
  const currentEmail = loginState.email?.toLowerCase();

  const operators: Operator[] = data ?? NONE;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [activeOperator, setActiveOperator] = useState<Operator | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Operator | null>(null);

  const stats = useMemo(() => {
    const active = operators.filter((o) => o.is_active).length;
    const byRole = Object.fromEntries(
      OPERATOR_ROLES.map((r) => [r.value, operators.filter((o) => o.role === r.value).length])
    );
    return { active, byRole };
  }, [operators]);

  const openCreate = () => {
    setDialogMode('create');
    setActiveOperator(null);
    setDialogOpen(true);
  };

  const openEdit = (operator: Operator) => {
    setDialogMode('edit');
    setActiveOperator(operator);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteOperator(pendingDelete.id).unwrap();
      toast.success('Operator deleted');
      setPendingDelete(null);
    } catch {
      // Interceptor toasts the DRF error (e.g. the self-delete guard).
    }
  };

  return (
    <PageShell
      title="Manage operators"
      actions={
        <Button size="lg" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          New operator
        </Button>
      }
    >
      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load operators.
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card p-4">
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : operators.length === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title="No operators yet"
          description="Staff who can operate the parking desk will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <KpiTile label="Operators" value={operators.length} caption={`${stats.active} active`} />
            <KpiTile label="Super admins" value={stats.byRole.superadmin ?? 0} caption="Full system access" />
            <KpiTile label="Admins" value={stats.byRole.admin ?? 0} caption="Back-office access" />
            <KpiTile label="POS" value={stats.byRole.pos ?? 0} caption="Front-desk checkout only" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Joined</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((operator) => {
                  const isSelf = operator.email.toLowerCase() === currentEmail;
                  return (
                    <tr key={operator.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {operator.email}
                        {isSelf && (
                          <Badge variant="secondary" className="ml-2 text-[10.5px]">
                            You
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-[10.5px]">
                          {roleLabel(operator.role)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-foreground">
                        {operator.phone_no || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill active={operator.is_active} />
                      </td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-foreground">
                        {new Date(operator.date_joined).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${operator.email}`}
                            onClick={() => openEdit(operator)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${operator.email}`}
                            disabled={isSelf}
                            title={isSelf ? "You can't delete your own account" : undefined}
                            onClick={() => setPendingDelete(operator)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OperatorDialog
        mode={dialogMode}
        operator={activeOperator}
        isSelf={dialogMode === 'edit' && activeOperator?.email.toLowerCase() === currentEmail}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        busy={deleting}
        title={`Delete ${pendingDelete?.email ?? 'operator'}?`}
        description="This operator will lose access to the parking desk immediately. This cannot be undone."
        confirmLabel="Delete operator"
        onOpenChange={(next) => { if (!next) setPendingDelete(null); }}
        onConfirm={confirmDelete}
      />
    </PageShell>
  );
};

export default ManageOperatorsPage;
