import { useState } from 'react';
import { LuKeyRound, LuPencil, LuUserPlus, LuUsers } from 'react-icons/lu';
import type { UserAdmin } from '../../api/types';
import { useUsers } from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { RoleBadge } from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/date';
import { pluralize } from '../../utils/format';
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from './UserDialogs';

type DialogState = { type: 'create' } | { type: 'edit'; user: UserAdmin } | { type: 'reset'; user: UserAdmin } | null;

const collator = new Intl.Collator('sv');

export function UsersTab() {
  const { user: me } = useAuth();
  const users = useUsers();
  const [dialog, setDialog] = useState<DialogState>(null);

  const list = [...(users.data ?? [])].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || collator.compare(a.name, b.name),
  );
  const activeCount = list.filter((user) => user.isActive).length;

  return (
    <>
      <Card>
        <CardHeader
          title="Användare"
          description={
            users.data
              ? `${pluralize(list.length, 'användare', 'användare')} i företaget, varav ${activeCount} aktiva.`
              : 'Alla användare i företaget.'
          }
          actions={
            <Button icon={LuUserPlus} onClick={() => setDialog({ type: 'create' })}>
              Ny användare
            </Button>
          }
        />
        {users.isError ? (
          <ErrorState
            error={users.error}
            title="Användarna kunde inte hämtas"
            onRetry={() => void users.refetch()}
            retrying={users.isFetching}
          />
        ) : !users.isPending && list.length === 0 ? (
          <EmptyState icon={LuUsers} title="Inga användare" />
        ) : (
          <div className="table-wrap" aria-busy={users.isPending || undefined}>
            <table className="table table--wide">
              <caption className="visually-hidden">Företagets användare</caption>
              <thead>
                <tr>
                  <th scope="col">Namn</th>
                  <th scope="col">E-postadress</th>
                  <th scope="col">Roll</th>
                  <th scope="col">Status</th>
                  <th scope="col">Skapad</th>
                  <th scope="col" className="right">
                    Åtgärder
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.isPending ? (
                  <SkeletonRows rows={4} columns={6} />
                ) : (
                  list.map((user) => {
                    const isSelf = user.id === me?.id;
                    return (
                      <tr key={user.id} className={user.isActive ? undefined : 'is-muted'}>
                        <td>
                          <span className="user-cell">
                            <Avatar name={user.name} size="sm" />
                            <span className="cell-primary">{user.name}</span>
                            {isSelf && (
                              <Badge tone="neutral" size="sm">
                                Du
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="nowrap">{user.email}</td>
                        <td>
                          <RoleBadge role={user.role} />
                        </td>
                        <td>
                          <Badge tone={user.isActive ? 'success' : 'neutral'} size="sm" dot>
                            {user.isActive ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </td>
                        <td className="nowrap">{formatDate(user.createdAt)}</td>
                        <td className="right">
                          <div className="row-actions">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={LuPencil}
                              onClick={() => setDialog({ type: 'edit', user })}
                              aria-label={`Redigera ${user.name}`}
                            >
                              Redigera
                            </Button>
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={LuKeyRound}
                                onClick={() => setDialog({ type: 'reset', user })}
                                aria-label={`Återställ lösenord för ${user.name}`}
                              >
                                Återställ lösenord
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog?.type === 'create' && <CreateUserDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'edit' && (
        <EditUserDialog user={dialog.user} isSelf={dialog.user.id === me?.id} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'reset' && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </>
  );
}
