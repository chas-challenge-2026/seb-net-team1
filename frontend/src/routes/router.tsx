import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  parseSearchWith,
  redirect,
  stringifySearchWith,
} from '@tanstack/react-router';
import { queryClient } from '../api/queryClient';
import type { CurrentUser } from '../api/types';
import { sessionStore } from '../auth/session';
import { AppShell } from '../components/layout/AppShell';
import { RoutePending } from '../components/layout/RoutePending';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { ErrorPage } from '../pages/errors/ErrorPage';
import { NotFoundPage } from '../pages/errors/NotFoundPage';
import { LoginPage } from '../pages/login/LoginPage';
import {
  accountDetailSearchSchema,
  approvalsSearchSchema,
  auditLogSearchSchema,
  loginSearchSchema,
  newPaymentSearchSchema,
  paymentsSearchSchema,
  reportsSearchSchema,
  safeRedirect,
  settingsSearchSchema,
} from './searchSchemas';

export interface RouterContext {
  /** Reads the in-memory session, so guards always see the current state. */
  auth: { getUser: () => CurrentUser | null };
  queryClient: QueryClient;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** Page name shown in the top bar. */
    title?: string;
    /** Parent section shown before the title in the top bar. */
    section?: { title: string; to: '/payments' | '/accounts' };
  }
}

const paymentsSection = { title: 'Betalningar', to: '/payments' } as const;
const accountsSection = { title: 'Konton', to: '/accounts' } as const;

/** Path params are numeric ids. Anything else becomes NaN and the page shows "not found". */
const numericParam = <TKey extends string>(key: TKey) => ({
  parse: (params: Record<TKey, string>) => ({ [key]: Number(params[key]) }) as Record<TKey, number>,
  stringify: (params: Record<TKey, number>) => ({ [key]: String(params[key]) }) as Record<TKey, string>,
});

const rootRoute = createRootRouteWithContext<RouterContext>()({
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: loginSearchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.auth.getUser()) {
      throw redirect({ href: safeRedirect(search.redirect) ?? '/dashboard', replace: true });
    }
  },
  staticData: { title: 'Logga in' },
  component: LoginPage,
});

/** Everything below requires a signed-in user. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ context, location }) => {
    if (!context.auth.getUser()) {
      throw redirect({ to: '/login', search: { redirect: safeRedirect(location.href) }, replace: true });
    }
  },
  component: AppShell,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'dashboard',
  staticData: { title: 'Översikt' },
  component: DashboardPage,
});

const paymentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'payments',
  validateSearch: paymentsSearchSchema,
  staticData: { title: 'Betalningar' },
  component: lazyRouteComponent(() => import('../pages/payments/PaymentsPage'), 'PaymentsPage'),
});

const newPaymentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'payments/new',
  validateSearch: newPaymentSearchSchema,
  staticData: { title: 'Ny betalning', section: paymentsSection },
  component: lazyRouteComponent(() => import('../pages/payments/NewPaymentPage'), 'NewPaymentPage'),
});

const batchUploadRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'payments/batch',
  staticData: { title: 'Batchuppladdning', section: paymentsSection },
  component: lazyRouteComponent(() => import('../pages/payments/BatchUploadPage'), 'BatchUploadPage'),
});

const paymentDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'payments/$paymentId',
  params: numericParam('paymentId'),
  staticData: { title: 'Betalningsdetaljer', section: paymentsSection },
  component: lazyRouteComponent(() => import('../pages/payments/PaymentDetailPage'), 'PaymentDetailPage'),
});

const approvalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'approvals',
  validateSearch: approvalsSearchSchema,
  staticData: { title: 'Attestkorg' },
  component: lazyRouteComponent(() => import('../pages/approvals/ApprovalsPage'), 'ApprovalsPage'),
});

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'accounts',
  staticData: { title: 'Konton' },
  component: lazyRouteComponent(() => import('../pages/accounts/AccountsPage'), 'AccountsPage'),
});

const accountDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'accounts/$accountId',
  params: numericParam('accountId'),
  validateSearch: accountDetailSearchSchema,
  staticData: { title: 'Kontodetaljer', section: accountsSection },
  component: lazyRouteComponent(() => import('../pages/accounts/AccountDetailPage'), 'AccountDetailPage'),
});

const auditLogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'audit-log',
  validateSearch: auditLogSearchSchema,
  staticData: { title: 'Granskningslogg' },
  component: lazyRouteComponent(() => import('../pages/audit-log/AuditLogPage'), 'AuditLogPage'),
});

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'reports',
  validateSearch: reportsSearchSchema,
  staticData: { title: 'Rapporter' },
  component: lazyRouteComponent(() => import('../pages/reports/ReportsPage'), 'ReportsPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  validateSearch: settingsSearchSchema,
  staticData: { title: 'Inställningar' },
  component: lazyRouteComponent(() => import('../pages/settings/SettingsPage'), 'SettingsPage'),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    paymentsRoute,
    newPaymentRoute,
    batchUploadRoute,
    paymentDetailRoute,
    approvalsRoute,
    accountsRoute,
    accountDetailRoute,
    auditLogRoute,
    reportsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  context: {
    auth: { getUser: () => sessionStore.getUser() },
    queryClient,
  },
  // Plain query strings (?status=completed&page=2) instead of JSON-quoted values.
  // Numbers and booleans are still parsed, which the search schemas account for.
  parseSearch: parseSearchWith((value) => value),
  stringifySearch: stringifySearchWith(JSON.stringify),
  scrollRestoration: true,
  defaultPreload: 'intent',
  // Pages are loaded on demand; show a spinner only if that takes a noticeable moment.
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 300,
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: ErrorPage,
});
