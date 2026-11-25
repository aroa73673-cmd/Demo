"use client";

/**
 * NEXUS BANK — client auth context. Wraps /api/bank/auth endpoints.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { bankApi, ApiError, nestedErrorText } from "@/lib/bank-client";

export interface BankUser {
  id: string;
  email: string;
  name: string;
}

export interface AccountInfo {
  id: string;
  name: string;
  type: "CURRENT" | "SAVINGS";
  currency: string;
  balanceMinor: number;
  isDemo: boolean;
}

interface AuthCtx {
  user: BankUser | null;
  accounts: AccountInfo[];
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BankUser | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await bankApi.get<{ user: BankUser; accounts: AccountInfo[] }>("/auth/me");
      setUser(data.user);
      setAccounts(data.accounts);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setAccounts([]);
      }
      // other errors: keep prior state; surfaced by views individually
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await bankApi.post<{ user: BankUser }>("/auth/login", { email, password });
    setUser(data.user);
    await refresh();
  }, [refresh]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await bankApi.post<{ user: BankUser }>("/auth/register", { name, email, password });
    setUser(data.user);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await bankApi.post("/auth/logout");
    setUser(null);
    setAccounts([]);
  }, []);

  return (
    <Ctx.Provider value={{ user, accounts, loading, refresh, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}

export { nestedErrorText };
