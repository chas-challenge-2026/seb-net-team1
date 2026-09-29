import { Link } from '@tanstack/react-router';
import { LuChevronDown, LuLogOut, LuSettings } from 'react-icons/lu';
import { useAuth } from '../../auth/AuthContext';
import { firstName } from '../../utils/format';
import { Avatar } from '../ui/Avatar';
import { Popover } from '../ui/Popover';
import { RoleBadge } from '../ui/StatusBadge';

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <Popover
      kind="menu"
      label={`Användarmeny för ${user.name}`}
      triggerClassName="user-menu__trigger"
      panelClassName="user-menu"
      triggerContent={
        <>
          <Avatar name={user.name} size="sm" />
          <span className="user-menu__name">{firstName(user.name)}</span>
          <LuChevronDown className="user-menu__chevron" aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <>
          <div className="user-menu__header" role="presentation">
            <p className="user-menu__full-name">{user.name}</p>
            <p className="user-menu__email">{user.email}</p>
            <RoleBadge role={user.role} />
          </div>
          <div className="user-menu__items" role="presentation">
            <Link to="/settings" role="menuitem" className="menu-item" onClick={close}>
              <LuSettings aria-hidden="true" />
              Inställningar
            </Link>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                close();
                void logout();
              }}
            >
              <LuLogOut aria-hidden="true" />
              Logga ut
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}
