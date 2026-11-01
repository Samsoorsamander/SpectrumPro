import React, { createContext, useContext } from "react";

/** Whether this screen is the currently visible main-shell tab. */
export const ScreenActiveContext = createContext(true);

export function useScreenActive() {
  return useContext(ScreenActiveContext);
}
