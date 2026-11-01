import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Routes, useLocation } from "react-router-dom";
import { User } from "../../types";
import {
  renderAppScreenRoutes,
  ScreenRouteFallback,
} from "../AppScreenRoutes";
import { ScreenActiveContext } from "../../contexts/ScreenActiveContext";

const MAX_CACHED_SCREENS = 10;
const PINNED_PATHS = ["/inventory", "/purchases", "/companies"];

type FrozenLocation = {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
};

const CachedScreenPane = React.memo(
  function CachedScreenPane({
    path,
    active,
    tree,
    frozenLocation,
  }: {
    path: string;
    active: boolean;
    tree: React.ReactNode;
    frozenLocation: FrozenLocation;
  }) {
    return (
      <div
        style={{
          display: active ? "block" : "none",
          contentVisibility: active ? "visible" : "hidden",
          containIntrinsicSize: active ? undefined : "1px 800px",
          height: active ? "100%" : undefined,
        }}
        aria-hidden={!active}
        data-cached-screen={path}
      >
        <ScreenActiveContext.Provider value={active}>
          <Routes location={frozenLocation}>{tree}</Routes>
        </ScreenActiveContext.Provider>
      </div>
    );
  },
  (prev, next) =>
    prev.active === next.active &&
    prev.path === next.path &&
    prev.tree === next.tree &&
    prev.frozenLocation === next.frozenLocation
);

/**
 * Keep visited main-shell screens mounted and toggle visibility so tab
 * switches do not remount pages or re-run cold DB loads.
 */
export function CachedScreenOutlet({
  darkMode,
  currentUser,
}: {
  darkMode: boolean;
  currentUser: User;
}) {
  const location = useLocation();
  const activePath = location.pathname;
  const [visited, setVisited] = useState<string[]>(() => [activePath]);
  const frozenRef = useRef<Map<string, FrozenLocation>>(new Map());
  const treesRef = useRef<Map<string, React.ReactNode>>(new Map());
  const treeKey = `${darkMode ? "d" : "l"}:${currentUser.username}`;
  const prevTreeKey = useRef(treeKey);

  if (prevTreeKey.current !== treeKey) {
    treesRef.current.clear();
    prevTreeKey.current = treeKey;
  }

  useEffect(() => {
    setVisited((prev) => {
      const next = [activePath, ...prev.filter((p) => p !== activePath)];
      const pinned = PINNED_PATHS.filter(
        (p) => next.includes(p) || p === activePath
      );
      const rest = next.filter((p) => !PINNED_PATHS.includes(p));
      const room = Math.max(1, MAX_CACHED_SCREENS - pinned.length);
      const ordered = [
        activePath,
        ...pinned.filter((p) => p !== activePath),
        ...rest.filter((p) => p !== activePath).slice(0, room),
      ];
      const keep = new Set(ordered);
      for (const path of [...treesRef.current.keys()]) {
        if (!keep.has(path)) {
          treesRef.current.delete(path);
          frozenRef.current.delete(path);
        }
      }
      return ordered;
    });
  }, [activePath]);

  const prevActiveFrozen = frozenRef.current.get(activePath);
  const nextFrozen: FrozenLocation = {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    state: location.state,
    key: location.key,
  };
  // Reuse the same object when only the tab is re-rendered without a location change.
  if (
    !prevActiveFrozen ||
    prevActiveFrozen.pathname !== nextFrozen.pathname ||
    prevActiveFrozen.search !== nextFrozen.search ||
    prevActiveFrozen.hash !== nextFrozen.hash ||
    prevActiveFrozen.key !== nextFrozen.key ||
    prevActiveFrozen.state !== nextFrozen.state
  ) {
    frozenRef.current.set(activePath, nextFrozen);
  }

  const fallback = useMemo(
    () => <ScreenRouteFallback darkMode={darkMode} />,
    [darkMode]
  );

  return (
    <div className="h-full min-h-0">
      <Suspense fallback={fallback}>
        {visited.map((path) => {
          const active = path === activePath;
          const frozenLocation =
            frozenRef.current.get(path) ?? {
              pathname: path,
              search: "",
              hash: "",
              state: null,
              key: path,
            };
          let tree = treesRef.current.get(path);
          if (!tree) {
            tree = renderAppScreenRoutes(darkMode, currentUser, {
              suspense: false,
            });
            treesRef.current.set(path, tree);
          }
          return (
            <CachedScreenPane
              key={path}
              path={path}
              active={active}
              tree={tree}
              frozenLocation={frozenLocation}
            />
          );
        })}
      </Suspense>
    </div>
  );
}
