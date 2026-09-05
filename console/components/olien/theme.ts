"use client";

import { useCallback, useEffect, useState } from "react";

export type OlienTheme = "light" | "dark";
const KEY = "olien.theme";

// The signed-in console is light by default, the way Squads draws its dashboard;
// the door and the create flow stay dark. The choice lives in this browser only.
export function useOlienTheme(): [OlienTheme, () => void] {
  const [theme, setTheme] = useState<OlienTheme>("light");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch {
      // Private mode or blocked storage: the default stands.
    }
  }, []);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // Not persisted; still applied for this page.
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}
