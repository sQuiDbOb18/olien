"use client";

import { useCallback, useEffect, useState } from "react";

export type OlienTheme = "light" | "dark";
const KEY = "olien.theme";

// The console follows the device: dark when the system is dark, light otherwise,
// and it changes with the system until the member picks one themselves. That pick
// lives in this browser only. The door and the create flow stay dark regardless.
export function useOlienTheme(): [OlienTheme, () => void] {
  const [theme, setTheme] = useState<OlienTheme>("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      // Private mode or blocked storage: follow the system.
    }
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      // A pick made after this subscription wins over the system from then on.
      try {
        if (window.localStorage.getItem(KEY)) return;
      } catch {
        // Nothing stored anywhere, so the system decides.
      }
      setTheme(media.matches ? "dark" : "light");
    };
    follow();
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
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
