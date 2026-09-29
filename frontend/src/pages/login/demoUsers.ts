import type { Role } from '../../api/types';

/** Seeded demo accounts, offered as shortcuts on the login page in development only. */
export const DEMO_USERS: ReadonlyArray<{ name: string; email: string; role: Role }> = [
  { name: 'Lisa', email: 'lisa@malmobygg.se', role: 'initiator' },
  { name: 'Johan', email: 'johan@malmobygg.se', role: 'attestant' },
  { name: 'Sara', email: 'sara@malmobygg.se', role: 'admin' },
  { name: 'Erik', email: 'erik@malmobygg.se', role: 'attestant' },
];

export const DEMO_PASSWORD = 'password123';
