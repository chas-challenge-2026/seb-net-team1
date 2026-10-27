import type { AuthResponse, CurrentUser } from '../api/types';

/**
 * The signed-in session. It lives in memory only: the access token is never written
 * to localStorage or sessionStorage. A page reload restores the session through the
 * httpOnly refresh cookie (POST /api/auth/refresh).
 */
export interface Session {
  accessToken: string;
  expiresAt: string;
  user: CurrentUser;
}

type Listener = () => void;

let current: Session | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

const HINT_KEY = 'seb-foretagsbetalningar:signed-in';

/**
 * A non-secret flag that says whether this browser has signed in and not signed out
 * since. It only lets the app skip the startup refresh (and its expected 401) when
 * there certainly is no session; it never holds a token or any user data.
 */
export const sessionHint = {
  mayExist(): boolean {
    try {
      return window.localStorage.getItem(HINT_KEY) === '1';
    } catch {
      // Storage unavailable (e.g. blocked): always try to restore the session.
      return true;
    }
  },

  set(signedIn: boolean) {
    try {
      if (signedIn) window.localStorage.setItem(HINT_KEY, '1');
      else window.localStorage.removeItem(HINT_KEY);
    } catch {
      // Storage unavailable; the hint is only an optimization.
    }
  },
};

export const sessionStore = {
  get(): Session | null {
    return current;
  },

  getAccessToken(): string | null {
    return current?.accessToken ?? null;
  },

  getUser(): CurrentUser | null {
    return current?.user ?? null;
  },

  setFromAuth(auth: AuthResponse) {
    current = { accessToken: auth.accessToken, expiresAt: auth.expiresAt, user: auth.user };
    sessionHint.set(true);
    emit();
  },

  /** Keeps the signed-in user in sync after they change their own details. */
  updateUser(changes: Partial<Pick<CurrentUser, 'name' | 'email' | 'role'>>) {
    if (current === null) return;
    current = { ...current, user: { ...current.user, ...changes } };
    emit();
  },

  /** Ends the session (logout, or the refresh token was rejected). */
  clear() {
    sessionHint.set(false);
    if (current === null) return;
    current = null;
    emit();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
