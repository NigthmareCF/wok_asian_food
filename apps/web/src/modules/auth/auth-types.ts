export type AppRole = "ADMIN" | "CLIENT" | "OPERATIONAL";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  permissions: string[];
};

export type LoginResult = {
  user: AuthenticatedUser;
  redirectTo: string;
};
