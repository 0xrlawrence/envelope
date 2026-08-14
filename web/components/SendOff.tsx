"use client";

import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

/**
 * The send.
 *
 * An envelope stops being yours the moment you hand it over, and that is the
 * one irreversible thing this product does. It gets the one piece of theatre:
 * the page clears out of the way, the envelope folds into a dart, and the dart
 * carries the amount off into the wind.
 *
 * The dart is folded geometry with flat shading, so the creases catch the light
 * the way paper does, and the wind is instanced streaks moving through the same
 * scene. Both are real geometry rather than pictures of geometry, which is what
 * makes the fold read as a fold rather than as a sprite being swapped.
 */
const STREAKS = 320;

export function SendOff({
  amount,
  symbol,
  onDone,
}: {
  amount: string;
  symbol: string;
  onDone?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const finished = useRef(false);

  // Held in refs so the scene is built exactly once. Taking these as effect
  // dependencies meant every parent render tore the scene down and started the
  // flight again, and the parent re-renders once a second while it counts the
  // wait, so the dart never got more than a second into the air.
  const latest = useRef({ amount, symbol, onDone });
  latest.current = { amount, symbol, onDone };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const { amount, symbol } = latest.current;

    const settle = () => {
      if (finished.current) return;
      finished.current = true;
      latest.current.onDone?.();
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settle();
      return;
    }

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true });
    } catch (error) {
      console.error("[envelope] send-off could not create a renderer", error);
      settle();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 7.2);

    scene.add(new AmbientLight(0xffffff, 0.55));
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new DirectionalLight(0x9fc0ff, 0.8);
    rim.position.set(-4, -2, 2);
    scene.add(rim);

    // ── The dart ───────────────────────────────────────────────────────────
    // Folded from a sheet: two top wings with a little dihedral, and a keel
    // beneath the centreline. Flat shading leaves the creases visible.
    const nose = [0, 0, 1.35];
    const tail = [0, 0, -0.95];
    const leftTip = [-1.05, 0.1, -0.8];
    const rightTip = [1.05, 0.1, -0.8];
    const keel = [0, -0.34, -0.85];

    const dartGeometry = new BufferGeometry();
    dartGeometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([
          ...nose, ...leftTip, ...tail,
          ...nose, ...tail, ...rightTip,
          ...nose, ...keel, ...tail,
        ]),
        3,
      ),
    );
    dartGeometry.computeVertexNormals();

    const dart = new Mesh(
      dartGeometry,
      new MeshStandardMaterial({
        color: 0xe9e4d7,
        roughness: 0.85,
        metalness: 0,
        flatShading: true,
        side: 2,
      }),
    );

    const plane = new Group();
    plane.add(dart);

    // The amount rides on the wing, printed rather than floating beside it.
    const label = document.createElement("canvas");
    label.width = 512;
    label.height = 256;
    const context = label.getContext("2d");
    if (context) {
      const styles = getComputedStyle(document.body);
      const display = styles.getPropertyValue("--font-plex-condensed").trim() || "sans-serif";
      context.clearRect(0, 0, label.width, label.height);
      context.fillStyle = "#0e141c";
      context.font = `700 150px ${display}`;
      context.textAlign = "center";
      context.fillText(amount, 256, 150);
      context.fillStyle = "#5d6979";
      context.font = `600 52px ${display}`;
      context.letterSpacing = "10px";
      context.fillText(symbol, 256, 210);
    }
    const labelTexture = new CanvasTexture(label);
    labelTexture.colorSpace = SRGBColorSpace;

    const labelMesh = new Mesh(
      new PlaneGeometry(0.95, 0.48),
      new MeshBasicMaterial({ map: labelTexture, transparent: true }),
    );
    labelMesh.rotation.x = -Math.PI / 2;
    labelMesh.position.set(-0.42, 0.06, -0.18);
    labelMesh.rotation.z = 0.06;
    plane.add(labelMesh);

    plane.position.set(-2.6, -0.4, 0);
    plane.rotation.set(0, 0.35, 0.1);
    scene.add(plane);

    // ── Wind ───────────────────────────────────────────────────────────────
    // Instanced streaks rather than a texture: they move at different speeds,
    // which is what makes moving air read as depth instead of as a filter.
    const streakGeometry = new PlaneGeometry(1, 0.012);
    const streakMaterial = new MeshBasicMaterial({
      color: 0x7fa6e0,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const streaks = new InstancedMesh(streakGeometry, streakMaterial, STREAKS);
    scene.add(streaks);

    const seeds = Array.from({ length: STREAKS }, () => ({
      x: Math.random() * 26 - 13,
      y: Math.random() * 11 - 5.5,
      z: Math.random() * 6 - 4,
      length: 0.5 + Math.random() * 2.6,
      speed: 5 + Math.random() * 16,
    }));

    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    const position = new Vector3();

    const layoutStreaks = (delta: number) => {
      for (let index = 0; index < STREAKS; index += 1) {
        const seed = seeds[index]!;
        seed.x -= seed.speed * delta;
        if (seed.x < -14) {
          seed.x = 14 + Math.random() * 6;
          seed.y = Math.random() * 11 - 5.5;
        }
        position.set(seed.x, seed.y, seed.z);
        scale.set(seed.length, 1, 1);
        matrix.compose(position, quaternion, scale);
        streaks.setMatrixAt(index, matrix);
      }
      streaks.instanceMatrix.needsUpdate = true;
    };
    layoutStreaks(0);

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);

    // The flight is driven by this loop's own clock rather than by a tweening
    // library. An animation library keeps its own ticker, that ticker parks
    // itself whenever the document reports hidden, and reconciling the two
    // clocks turned out to cost more than the easing is worth. Here elapsed
    // time is the only state, so the flight cannot start in the past or finish
    // in a single frame.
    const easeIn = (t: number) => t * t;
    const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
    const at = (t: number, from: number, to: number, ease: (v: number) => number) =>
      from + (to - from) * ease(Math.min(Math.max(t, 0), 1));

    const GATHER = 0.24;
    const THROW = 0.54;
    const AWAY = 1.2;
    const TOTAL = GATHER + THROW + AWAY;

    let frame = 0;
    const started = performance.now();
    let last = started;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = (now - started) / 1000;

      if (elapsed < GATHER) {
        // Drawing back, the way a hand does before a throw.
        const t = elapsed / GATHER;
        plane.position.set(at(t, -2.6, -3.15, easeIn), at(t, -0.4, -0.75, easeIn), 0);
        plane.rotation.set(0, 0.35, at(t, 0.1, 0.26, easeIn));
      } else if (elapsed < GATHER + THROW) {
        const t = (elapsed - GATHER) / THROW;
        plane.position.set(at(t, -3.15, 1.3, easeOut), at(t, -0.75, 0.55, easeOut), 0);
        plane.rotation.set(0, at(t, 0.35, 0.05, easeOut), at(t, 0.26, -0.14, easeOut));
      } else {
        const t = (elapsed - GATHER - THROW) / AWAY;
        plane.position.set(
          at(t, 1.3, 14, easeIn),
          at(t, 0.55, 2.6, easeIn),
          at(t, 0, -3.5, easeIn),
        );
        plane.rotation.set(
          at(t, 0, 0.28, easeIn),
          at(t, 0.05, -0.55, easeIn),
          at(t, -0.14, -0.6, easeIn),
        );
      }

      // Wind rises with the throw and falls once it is gone.
      const rise = Math.min(elapsed / 0.5, 1);
      const fall = 1 - Math.min(Math.max((elapsed - (TOTAL - 0.5)) / 0.5, 0), 1);
      streakMaterial.opacity = 0.55 * rise * fall;

      layoutStreaks(delta);
      renderer.render(scene, camera);

      if (elapsed > TOTAL) settle();
    };
    frame = requestAnimationFrame(loop);


    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      dartGeometry.dispose();
      (dart.material as MeshStandardMaterial).dispose();
      streakGeometry.dispose();
      streakMaterial.dispose();
      streaks.dispose();
      labelTexture.dispose();
      labelMesh.geometry.dispose();
      (labelMesh.material as MeshBasicMaterial).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40"
    />
  );
}
