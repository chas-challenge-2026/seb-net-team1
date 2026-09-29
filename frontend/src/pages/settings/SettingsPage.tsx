import { getRouteApi } from '@tanstack/react-router';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabPanel, Tabs, type TabItem } from '../../components/ui/Tabs';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ProfileTab } from './ProfileTab';
import { SecurityTab } from './SecurityTab';
import { UsersTab } from './UsersTab';
import '../../styles/pages/settings.css';

const routeApi = getRouteApi('/app/settings');

type SettingsTab = 'profile' | 'security' | 'users';

export function SettingsPage() {
  useDocumentTitle('Inställningar');
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { isAdmin } = useAuth();

  const requested: SettingsTab = search.tab ?? 'profile';
  // The user tab only exists for administrators.
  const tab: SettingsTab = requested === 'users' && !isAdmin ? 'profile' : requested;

  const items: TabItem<SettingsTab>[] = [
    { id: 'profile', label: 'Profil' },
    { id: 'security', label: 'Säkerhet' },
  ];
  if (isAdmin) items.push({ id: 'users', label: 'Användare' });

  return (
    <div className="page">
      <PageHeader
        title="Inställningar"
        description={
          isAdmin
            ? 'Din profil och ditt lösenord, samt företagets användare.'
            : 'Din profil och ditt lösenord.'
        }
      />
      <div className="page-tabs">
        <Tabs<SettingsTab>
          idPrefix="settings"
          label="Inställningar"
          value={tab}
          onChange={(next) => void navigate({ search: { tab: next === 'profile' ? undefined : next } })}
          items={items}
        />
      </div>
      <TabPanel idPrefix="settings" tab={tab}>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'users' && isAdmin && <UsersTab />}
      </TabPanel>
    </div>
  );
}
