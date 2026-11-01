import React, { createContext, useContext, useMemo } from "react";
import { User } from "../types";
import {
  canReadModule,
  canWriteModule,
  isAdmin,
  moduleIdFromPath,
} from "../utils/permissions";

type AuthContextValue = {
  currentUser: User;
  isAdmin: boolean;
  canRead: (moduleId: string) => boolean;
  canWrite: (moduleId: string) => boolean;
  canWritePath: (path: string) => boolean;
  canReadPath: (path: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser: user,
      isAdmin: isAdmin(user),
      canRead: (moduleId: string) => canReadModule(user, moduleId),
      canWrite: (moduleId: string) => canWriteModule(user, moduleId),
      canWritePath: (path: string) => {
        const id = moduleIdFromPath(path);
        return id ? canWriteModule(user, id) : isAdmin(user);
      },
      canReadPath: (path: string) => {
        const id = moduleIdFromPath(path);
        return id ? canReadModule(user, id) : isAdmin(user);
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
