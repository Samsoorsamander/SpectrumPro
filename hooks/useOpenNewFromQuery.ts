import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * When the URL has ?new=1, call openCreate once and strip the query.
 * Uses a handled ref so Strict Mode / re-renders do not re-open the form.
 */
export function useOpenNewFromQuery(openCreate: () => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const handledKey = useRef<string | null>(null);

  useEffect(() => {
    if (searchParams.get("new") !== "1") {
      handledKey.current = null;
      return;
    }
    const key = searchParams.toString();
    if (handledKey.current === key) return;
    handledKey.current = key;

    openCreate();

    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    // Intentionally only react to the query flag, not openCreate identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);
}
