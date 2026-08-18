"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The envelope, turning.
 *
 * A short silent loop of the object the whole product is named after, set
 * beside the list of envelopes you have sent. It is decoration and says so:
 * `aria-hidden`, no controls, no sound, and nothing about the page depends on
 * it loading.
 *
 * The footage is a bright glass envelope on pure black, which is why the two
 * themes present it differently. On dark stock the black is blended away with
 * `mix-blend-mode: screen`, so the object genuinely floats over the page
 * instead of sitting in a rectangle. That cannot work on white, where screen
 * blending against the page returns white, so light mode keeps the footage on
 * its own black plate and lets it read as a panel.
 */
export function Reel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * Autoplay is withheld until the reader is known not to have asked for less
   * motion. Server and first render both assume they did, because that is the
   * assumption that cannot annoy anyone: the poster frame shows either way.
   */
  const [mayMove, setMayMove] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMayMove(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  /**
   * A rejected play is not worth reporting. The poster stays up, and it is a
   * still of the same object, so the page looks composed either way.
   */
  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || !mayMove) return;
    void video.play().catch(() => {});
  }, [mayMove]);

  /**
   * Asked more than once, because the first ask can land before there is
   * anything to play or while the element is not being rendered at all: this is
   * hidden below the tablet breakpoint, and a `play()` there is simply lost with
   * no event afterwards to retry on. `canPlay` covers the data arriving late and
   * a returning tab covers the rest.
   *
   * Nothing here ever pauses on its own. Deciding when a decorative loop is
   * worth decoding is the browser's job, it already throttles what is offscreen
   * or backgrounded, and every attempt to second-guess it from here ended up
   * stopping the loop in a case that turned out to be perfectly visible.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!mayMove) {
      video.pause();
      return;
    }
    play();
    const onVisible = () => {
      if (!document.hidden) play();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [mayMove, play]);

  // Inlined rather than resolved by the bundler, because the app is exported
  // statically under a sub-path on Pages and a bare absolute path would drop it.
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <video
      ref={videoRef}
      aria-hidden
      className="reel-video block w-full"
      muted
      loop
      playsInline
      preload="auto"
      onCanPlay={play}
      poster={`${base}/media/prismatic-envelope.jpg`}
    >
      <source src={`${base}/media/prismatic-envelope.mp4`} type="video/mp4" />
    </video>
  );
}
