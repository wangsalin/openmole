import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { clearToken, getToken, setToken } from './api';
import { ActiveContext, SessionRole, SessionUser } from './types';

interface AuthState {
  token: string | null;
  user?: SessionUser;
  roles: SessionRole[];
  activeContext?: ActiveContext;
  signIn(session: {
    accessToken: string;
    user: SessionUser;
    roles: SessionRole[];
    activeContext?: ActiveContext;
  }): void;
  signOut(): void;
  setActiveContext(context: ActiveContext): void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<SessionUser | undefined>();
  const [roles, setRoles] = useState<SessionRole[]>([]);
  const [activeContext, setActiveContextState] = useState<ActiveContext | undefined>();

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      roles,
      activeContext,
      signIn(session) {
        setToken(session.accessToken);
        setTokenState(session.accessToken);
        setUser(session.user);
        setRoles(session.roles);
        setActiveContextState(session.activeContext);
      },
      signOut() {
        clearToken();
        setTokenState(null);
        setUser(undefined);
        setRoles([]);
        setActiveContextState(undefined);
      },
      setActiveContext(context) {
        setActiveContextState(context);
      },
    }),
    [activeContext, roles, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
