import { createContext, useContext, useEffect, useState } from "react";

const KEY = "st-auth";

type AuthCtx = {
  token: string | null;
  setToken: (t: string) => void;
  clear: () => void;
};

const Ctx = createContext<AuthCtx>({ token: null, setToken: () => {}, clear: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(localStorage.getItem(KEY));
  }, []);

  const setToken = (t: string) => {
    localStorage.setItem(KEY, t);
    setTokenState(t);
  };
  const clear = () => {
    localStorage.removeItem(KEY);
    setTokenState(null);
  };

  return <Ctx.Provider value={{ token, setToken, clear }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const AUTH_STORAGE_KEY = KEY;