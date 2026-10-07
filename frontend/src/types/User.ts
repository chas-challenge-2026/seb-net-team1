export type User = {
  id: number;
  tenantId: number;
  name: string;
  email: string;
  role: string;
};

export type LoginResponse = {
  user: User;
};
