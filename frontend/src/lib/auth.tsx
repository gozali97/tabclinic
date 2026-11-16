import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Me {
  user_id: string;
  email: string;
  full_name: string;
  is_superadmin: boolean;
  company_id: string | null;
  company_name: string | null;
  branch_id: string | null;
  roles: string[];
  expires_at: string;
}

interface AuthContextType {
  me: Me | null;
  loading: boolean;
  isAuthenticated: boolean;
  needsCompany: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  selectCompany: (companyId: string) => Promise<Me>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Session lives in the HttpOnly cookie; this only mirrors GET /auth/me.
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const m = await api.post<Me>("/auth/login", { email, password });
      qc.clear();
      setMe(m);
      return m;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    qc.clear();
    setMe(null);
  }, [qc]);

  const selectCompany = useCallback(
    async (companyId: string) => {
      const m = await api.post<Me>("/auth/select-company", {
        company_id: companyId,
      });
      qc.clear();
      setMe(m);
      return m;
    },
    [qc],
  );

  const hasRole = useCallback(
    (...roles: string[]) =>
      !!me && (me.is_superadmin || me.roles.some((r) => roles.includes(r))),
    [me],
  );

  return (
    <AuthContext.Provider
      value={{
        me,
        loading,
        isAuthenticated: !!me,
        needsCompany: !!me?.is_superadmin && !me.company_id,
        login,
        logout,
        selectCompany,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
