/**
 * The app's own base URL, including any subdirectory it is published under.
 *
 * `window.location.origin` alone is wrong on GitHub Pages: the app lives at
 * `/envelope`, and a claim link built from the origin points at a path that
 * does not exist. Getting this wrong produces links that look right and open
 * nothing, which for a bearer instrument means the money is unreachable.
 */
export function appOrigin(): string {
  if (typeof window === "undefined") return "";
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${base}`;
}
