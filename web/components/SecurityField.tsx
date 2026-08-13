"use client";

import { useEffect, useRef } from "react";
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";

/**
 * The security tint, rendered as the thing it actually is.
 *
 * The pattern printed inside a paper envelope defeats reading-through by
 * interference: two fine rulings at slightly different angles and pitches beat
 * against each other, and the beat is what the eye cannot resolve. CSS can draw
 * the rulings but not the beat, because the beat only exists once the two are
 * sampled together at pixel resolution.
 *
 * So this is a fragment shader rather than a gradient: the moire is computed per
 * pixel, drifts slowly, and leans a fraction of a degree toward the pointer. It
 * is the one place in this app where a shader is the correct material rather
 * than an effect applied to a surface that did not ask for one.
 */
const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uPointer;
uniform float uIntensity;

/** One fine ruling: a sine grating at an angle, in normalised space. */
float ruling(vec2 p, float angle, float pitch, float phase) {
  vec2 direction = vec2(cos(angle), sin(angle));
  return sin(dot(p, direction) * pitch + phase);
}

void main() {
  // Normalise on height so the pattern does not stretch with the viewport.
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  // Two rulings, deliberately mismatched. Equal angles and pitches would give a
  // plain hatch; the mismatch is the entire point.
  float drift = uTime * 0.02;
  float leanX = uPointer.x * 0.05;
  float leanY = uPointer.y * 0.05;

  float a = ruling(p,  0.62 + leanX, 302.0,  drift);
  float b = ruling(p, -0.58 + leanY, 296.0, -drift * 1.31);

  // The product of two gratings is the interference. Its low frequency envelope
  // is the visible moire; the high frequency carrier is what the eye gives up on.
  float interference = a * b;

  // Keep only the envelope, softly, so the carrier does not alias into fizz.
  float beat = smoothstep(0.15, 1.0, abs(interference));

  // A slow breath across the field, so it reads as printed stock catching light
  // rather than as an animation playing.
  float breath = 0.85 + 0.15 * sin(uTime * 0.11 + p.y * 1.7);

  vec3 ink   = vec3(0.031, 0.047, 0.067);
  vec3 plate = vec3(0.129, 0.290, 0.545);

  vec3 colour = mix(ink, plate, beat * 0.5 * breath * uIntensity);
  gl_FragColor = vec4(colour, beat * 0.20 * uIntensity);
}
`;

const VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function SecurityField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false });
    } catch {
      // No WebGL. The CSS tint underneath is the whole design already, so
      // there is nothing to fall back to and nothing to apologise for.
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uPointer: { value: new Vector2(0, 0) },
        uIntensity: { value: 1 },
      },
    });

    scene.add(new Mesh(new PlaneGeometry(2, 2), material));

    // Half resolution is plenty: the visible content is the low frequency beat,
    // and the carrier we are deliberately throwing away is what costs pixels.
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
      material.uniforms.uResolution!.value.set(
        width * renderer.getPixelRatio(),
        height * renderer.getPixelRatio(),
      );
    };
    resize();
    window.addEventListener("resize", resize);

    const pointerTarget = new Vector2(0, 0);
    const onPointerMove = (event: PointerEvent) => {
      pointerTarget.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let frame = 0;
    let start = performance.now();

    const renderOnce = (elapsed: number) => {
      material.uniforms.uTime!.value = elapsed;
      renderer.render(scene, camera);
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      // Ease the lean so a flicked pointer does not snap the plate around.
      const pointer = material.uniforms.uPointer!.value as Vector2;
      pointer.lerp(pointerTarget, 0.04);
      renderOnce((performance.now() - start) / 1000);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const play = () => {
      if (frame || reduced.matches) return;
      start = performance.now() - start;
      start = performance.now();
      frame = requestAnimationFrame(loop);
    };

    // A nonessential loop must not run against a hidden tab.
    const onVisibility = () => (document.hidden ? stop() : play());
    document.addEventListener("visibilitychange", onVisibility);

    const onReducedChange = () => {
      if (reduced.matches) {
        stop();
        renderOnce(0);
      } else {
        play();
      }
    };
    reduced.addEventListener("change", onReducedChange);

    if (reduced.matches) renderOnce(0);
    else play();

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onReducedChange);
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
