import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type GlobalSearchContextValue = {
  query: string;
  setQuery: (q: string) => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(
  null
);

export function GlobalSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [query, setQueryState] = useState("");

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
  }, []);

  const value = useMemo(
    () => ({ query, setQuery }),
    [query, setQuery]
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearch must be used within GlobalSearchProvider");
  }
  return ctx;
}
