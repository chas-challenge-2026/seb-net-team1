import { Link, useMatches } from '@tanstack/react-router';
import type { RefObject } from 'react';
import { LuChevronRight, LuMenu } from 'react-icons/lu';
import { GlobalSearch } from './GlobalSearch';
import { NotificationsMenu } from './NotificationsMenu';
import { UserMenu } from './UserMenu';

interface TopbarProps {
  menuOpen: boolean;
  onOpenMenu: () => void;
  menuButtonRef: RefObject<HTMLButtonElement>;
}

export function Topbar({ menuOpen, onOpenMenu, menuButtonRef }: TopbarProps) {
  const matches = useMatches();
  const staticData = matches[matches.length - 1]?.staticData;
  const title = staticData?.title;
  const section = staticData?.section;

  return (
    <header className="topbar">
      <button
        ref={menuButtonRef}
        type="button"
        className="icon-button topbar__menu-button"
        onClick={onOpenMenu}
        aria-label="Öppna menyn"
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
      >
        <LuMenu aria-hidden="true" />
      </button>

      <div className="topbar__context">
        {section ? (
          <nav aria-label="Sökväg">
            <ol className="breadcrumbs">
              <li>
                <Link to={section.to} className="breadcrumbs__link">
                  {section.title}
                </Link>
                <LuChevronRight className="breadcrumbs__separator" aria-hidden="true" />
              </li>
              <li aria-current="page" className="breadcrumbs__current">
                {title}
              </li>
            </ol>
          </nav>
        ) : (
          title && <p className="topbar__title">{title}</p>
        )}
      </div>

      <GlobalSearch />

      <div className="topbar__actions">
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}
