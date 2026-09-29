import { LuCircleCheck, LuCircleMinus } from 'react-icons/lu';
import { useCurrentUserQuery } from '../../api/auth';
import { useCurrentUser } from '../../auth/AuthContext';
import { hasPermission, type Permission } from '../../auth/roles';
import { Avatar } from '../../components/ui/Avatar';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { DescriptionList } from '../../components/ui/DescriptionList';
import { RoleBadge } from '../../components/ui/StatusBadge';
import { cn } from '../../utils/cn';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../utils/labels';

const PERMISSION_ROWS: Array<{ label: string; permission: Permission | null }> = [
  { label: 'Se översikt, betalningar, konton, rapporter och granskningslogg', permission: null },
  { label: 'Skapa betalningar och batchuppladdningar', permission: 'createPayments' },
  { label: 'Attestera andra användares betalningar', permission: 'approve' },
  { label: 'Hantera användare och verifiera granskningsloggen', permission: 'admin' },
];

export function ProfileTab() {
  const sessionUser = useCurrentUser();
  // The session is the source of truth; /api/auth/me refreshes the details when it answers.
  const me = useCurrentUserQuery();
  const user = me.data ?? sessionUser;

  return (
    <div className="settings-grid">
      <Card>
        <CardHeader title="Profil" description="Kontakta en administratör om något behöver ändras." divider />
        <CardBody>
          <div className="profile-head">
            <Avatar name={user.name} size="lg" />
            <div>
              <p className="profile-head__name">{user.name}</p>
              <p className="profile-head__email">{user.email}</p>
            </div>
          </div>
          <DescriptionList
            items={[
              { label: 'Namn', value: user.name },
              { label: 'E-postadress', value: user.email },
              { label: 'Roll', value: <RoleBadge role={user.role} /> },
              { label: 'Företag', value: user.tenantName },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Behörigheter"
          description={`${ROLE_LABELS[user.role] ?? user.role}: ${ROLE_DESCRIPTIONS[user.role] ?? ''}`}
          divider
        />
        <CardBody>
          <ul className="permission-list">
            {PERMISSION_ROWS.map(({ label, permission }) => {
              const allowed = permission === null || hasPermission(user.role, permission);
              return (
                <li key={label} className={cn('permission-list__item', allowed ? 'is-allowed' : 'is-denied')}>
                  {allowed ? <LuCircleCheck aria-hidden="true" /> : <LuCircleMinus aria-hidden="true" />}
                  <span>
                    {label}
                    <span className="visually-hidden">{allowed ? ' – tillåtet' : ' – inte tillåtet'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="permission-list__note">
            Ingen kan attestera sina egna betalningar, oavsett roll (fyra ögon-principen).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
