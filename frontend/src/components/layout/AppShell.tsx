import { Outlet, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Layout for every signed-in page: sidebar (drawer below 1024px), top bar and content. */
export function AppShell() {
  const { user } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useScrollLock(menuOpen);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) {
      // The page is inert while the drawer is open; lift that before moving focus back.
      columnRef.current?.removeAttribute('inert');
      menuButtonRef.current?.focus();
    }
  }, []);

  // Close the drawer after every navigation, and move focus to the new page's content
  // so keyboard and screen reader users start at the top of it.
  useEffect(
    () =>
      router.subscribe('onResolved', (event) => {
        setMenuOpen(false);
        if (event.pathChanged && event.fromLocation) {
          columnRef.current?.removeAttribute('inert');
          mainRef.current?.focus({ preventScroll: true });
        }
      }),
    [router],
  );

  // The drawer does not exist on wide screens; close it if the window grows.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    columnRef.current?.toggleAttribute('inert', menuOpen);
    if (!menuOpen) return;

    // Move focus into the drawer. It can take a frame before the drawer is visible
    // (and therefore focusable), so retry briefly.
    let frame = 0;
    const focusDrawer = (attemptsLeft: number) => {
      const button = closeButtonRef.current;
      button?.focus();
      if (button && document.activeElement !== button && attemptsLeft > 0) {
        frame = window.requestAnimationFrame(() => focusDrawer(attemptsLeft - 1));
      }
    };
    focusDrawer(10);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMenu(true);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

  if (!user) return null;

  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Hoppa till innehållet
      </a>

      <Sidebar open={menuOpen} onClose={() => closeMenu(true)} closeButtonRef={closeButtonRef} />
      {menuOpen && <div className="app-shell__overlay" onClick={() => closeMenu(false)} aria-hidden="true" />}

      <div className="app-shell__column" ref={columnRef}>
        <Topbar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} menuButtonRef={menuButtonRef} />
        <main id="main-content" className="app-content" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
