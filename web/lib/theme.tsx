"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "envelope.theme";

/**
 * Read the stored choice before the first paint.
 *
 * Injected into the document head and run synchronously, because the
 * alternative is that everyone who chose light gets a black screen for one
 * frame on every navigation. Written as a string rather than a component so it
 * executes before React exists, and kept to one statement so there is nothing
 * in it that can throw and leave the page unstyled.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const Context = createContext<ThemeState>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Dark on the server and on the first client render, matching the CSS
  // default, so hydration sees what the markup said. The script above has
  // already applied the real choice to the element itself, so there is nothing
  // to correct visually; only this state needs catching up.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A blocked store costs the preference on the next visit, nothing more.
      }
      // Anything drawing its own pixels rather than reading CSS needs telling.
      window.dispatchEvent(new CustomEvent("envelope:theme", { detail: next }));
      return next;
    });
  }, []);

  return <Context.Provider value={{ theme, toggle }}>{children}</Context.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(Context);
}

/** For canvases, which cannot read a CSS variable and have to be told. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
