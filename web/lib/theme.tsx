"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";

export type Theme = "light" | "dark";

const STORAGE_KEY = "envelope.theme";

/**
 * Read the stored choice before the first paint.
 *
 * Injected into the document head and run synchronously, because the
 * alternative is that everyone who chose night gets a cream flash for one
 * frame on every navigation. Written as a string rather than a component so it
 * executes before React exists, and kept to one statement so there is nothing
 * in it that can throw and leave the page unstyled.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * The colour a phone paints its own browser chrome with.
 *
 * On mobile the address bar and the gesture area sit directly against the page,
 * so leaving this unset means a white strip above a black page. These are the
 * two `--ink-deep` values, written literally because the meta tag is read by
 * the browser rather than by the stylesheet and cannot resolve a variable.
 */
const CHROME_COLOUR: Record<Theme, string> = {
  light: "#f2ece0",
  dark: "#0b1424",
};

function paintBrowserChrome(theme: Theme): void {
  const tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (tag) tag.content = CHROME_COLOUR[theme];
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const Context = createContext<ThemeState>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Cream on the server and on the first client render, matching the CSS
  // default, so hydration sees what the markup said. The script above has
  // already applied the real choice to the element itself, so there is nothing
  // to correct visually; only this state needs catching up.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light" || stored === "dark") setTheme(stored);
    paintBrowserChrome(stored === "dark" ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

    const apply = () => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
      paintBrowserChrome(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A blocked store costs the preference on the next visit, nothing more.
      }
      // Anything drawing its own pixels rather than reading CSS needs telling,
      // and it has to happen inside this callback: the browser photographs the
      // page the moment the callback returns, so a canvas that repaints later
      // gets caught still wearing the old theme.
      window.dispatchEvent(new CustomEvent("envelope:theme", { detail: next }));
    };

    const wipe = (
      document as Document & {
        startViewTransition?: (update: () => void) => {
          ready?: Promise<void>;
          finished?: Promise<void>;
        };
      }
    ).startViewTransition;

    // Without support, or when large moving edges are unwelcome, the swap is
    // instant. That is the whole fallback: the CSS wipe is decoration over a
    // change that has already happened.
    if (
      typeof wipe !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      apply();
      return;
    }

    // `flushSync`, because React would otherwise batch the state update to
    // after the transition callback returns, and the icon would flip a beat
    // behind the paper it belongs to.
    const transition = wipe.call(document, () => flushSync(apply));

    // A transition that gets skipped rejects both of these, and nothing else is
    // listening, so it surfaces as an unhandled rejection. Clicking the toggle
    // twice quickly is enough to cause it: the second wipe aborts the first.
    // The theme still changes either way, because the callback has already run;
    // only the animation is lost, which is not worth an error for.
    transition?.ready?.catch(() => {});
    transition?.finished?.catch(() => {});
  }, []);

  return <Context.Provider value={{ theme, toggle }}>{children}</Context.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(Context);
}

/** For canvases, which cannot read a CSS variable and have to be told. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
