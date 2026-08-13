"use client";

import gsap from "gsap";
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { EnvelopeCard } from "./EnvelopeCard";

const WIDTH = 3.2;
const HEIGHT = 2.0;
const FLAP_DROP = HEIGHT * 0.38;
const FLAP_OPEN = -2.18;

export interface EnvelopeStageHandle {
  /** Play the seal: the flap folds shut and the wax is struck. */
  seal(): Promise<void>;
}

/**
 * The envelope, as an object rather than a picture of one.
 *
 * Sealing is this product's only verb, and the moment a balance becomes a
 * bearer instrument. A card that swaps to a different card cannot say that; a
 * flap that folds over the contents and takes a stamp can, because it is the
 * same object before and after. That continuity is the reason this is three
 * dimensional at all.
 *
 * If WebGL is unavailable, or the visitor asked for reduced motion, the flat
 * card renders instead. It carries the same information and is not a
 * degradation of the message, only of the theatre.
 */
export function EnvelopeStage({
  amount,
  symbol,
  caption,
  reference,
  handleRef,
}: {
  amount: string;
  symbol: string;
  caption?: string;
  reference?: string;
  handleRef?: RefObject<EnvelopeStageHandle | null>;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sealRef = useRef<(() => Promise<void>) | null>(null);
  const [live, setLive] = useState(false);

  useImperativeHandle(handleRef, () => ({
    seal: async () => {
      await sealRef.current?.();
    },
  }));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.02, 4.3);

    scene.add(new AmbientLight(0xffffff, 0.62));
    const key = new DirectionalLight(0xffffff, 1.15);
    key.position.set(2.2, 3.4, 4.2);
    scene.add(key);

    const group = new Group();
    group.rotation.set(-0.1, -0.16, 0);
    scene.add(group);

    // ── The face, drawn once and used as a texture ─────────────────────────
    const faceTexture = new CanvasTexture(
      drawFace({ amount, symbol, reference }),
    );
    faceTexture.colorSpace = SRGBColorSpace;
    faceTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const body = new Mesh(
      new PlaneGeometry(WIDTH, HEIGHT),
      new MeshBasicMaterial({ map: faceTexture }),
    );
    group.add(body);

    // ── The flap, hinged along the top edge ────────────────────────────────
    const flapGeometry = new BufferGeometry();
    flapGeometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([
          -WIDTH / 2, 0, 0,
          WIDTH / 2, 0, 0,
          0, -FLAP_DROP, 0,
        ]),
        3,
      ),
    );
    flapGeometry.computeVertexNormals();

    const flap = new Mesh(
      flapGeometry,
      new MeshStandardMaterial({
        color: 0x22303f,
        roughness: 0.88,
        metalness: 0,
        // The flap is seen from behind while open, and from the front once shut.
        side: 2,
      }),
    );
    flap.position.set(0, HEIGHT / 2, 0.012);
    flap.rotation.x = FLAP_OPEN;
    group.add(flap);

    // ── The wax ────────────────────────────────────────────────────────────
    const sealMaterial = new MeshStandardMaterial({
      color: 0xa8332f,
      roughness: 0.42,
      metalness: 0.05,
      transparent: true,
      opacity: 0,
    });
    const wax = new Mesh(new CircleGeometry(0.235, 48), sealMaterial);
    wax.position.set(0, HEIGHT / 2 - FLAP_DROP, 0.03);
    wax.scale.setScalar(0);
    group.add(wax);

    // ── Sizing ─────────────────────────────────────────────────────────────
    // The mount can measure zero on first layout, so this has to be able to
    // recover rather than assume the first reading is the real one.
    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // Drive GSAP from this scene's own frame loop rather than from its internal
    // ticker. Two schedulers for one scene means the tweened values and the
    // rendered frame can disagree by up to a frame, and GSAP's ticker parks
    // itself whenever the document reports hidden, which some embedded and
    // backgrounded contexts do while still painting. One clock avoids both.
    gsap.ticker.sleep();

    // ── Idle: a slow drift, plus a little lean toward the pointer ──────────
    const drift = gsap.to(group.rotation, {
      y: -0.06,
      x: -0.05,
      duration: 5.5,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });

    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (event: PointerEvent) => {
      const bounds = mount.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      gsap.updateRoot(performance.now() / 1000);
      group.position.x += (pointerX * 0.06 - group.position.x) * 0.05;
      group.position.y += (-pointerY * 0.04 - group.position.y) * 0.05;
      renderer.render(scene, camera);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const play = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const onVisibility = () => (document.hidden ? stop() : play());
    document.addEventListener("visibilitychange", onVisibility);
    play();
    setLive(true);

    // Development affordance: the seal can only otherwise be reached by
    // completing a real pool transaction, which makes it impossible to look at
    // while building. Stripped from production builds.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __sealEnvelope?: () => void }).__sealEnvelope = () =>
        void sealRef.current?.();
    }

    // ── The focal moment ───────────────────────────────────────────────────
    sealRef.current = () =>
      new Promise<void>((resolve) => {
        drift.pause();
        gsap
          .timeline({ onComplete: resolve })
          // Square up to the reader: this is about to become a document.
          .to(group.rotation, { x: -0.04, y: 0, duration: 0.5, ease: "power3.out" })
          // The fold. The slowest beat, because it is the one that means something.
          .to(flap.rotation, { x: 0, duration: 0.66, ease: "power3.inOut" }, "-=0.18")
          // The wax arrives from above the page rather than out of nothing.
          .fromTo(
            wax.scale,
            { x: 2.6, y: 2.6, z: 2.6 },
            { x: 1, y: 1, z: 1, duration: 0.34, ease: "power4.out" },
            "-=0.06",
          )
          .fromTo(sealMaterial, { opacity: 0 }, { opacity: 1, duration: 0.18 }, "<")
          // The press: a squash and recovery, the way a stamp actually behaves.
          .to(wax.scale, {
            x: 1.07,
            y: 1.07,
            duration: 0.11,
            yoyo: true,
            repeat: 1,
            ease: "sine.inOut",
          });
      });

    return () => {
      stop();
      drift.kill();
      gsap.killTweensOf([group.rotation, flap.rotation, wax.scale, sealMaterial]);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      faceTexture.dispose();
      body.geometry.dispose();
      (body.material as MeshBasicMaterial).dispose();
      flapGeometry.dispose();
      (flap.material as MeshStandardMaterial).dispose();
      wax.geometry.dispose();
      sealMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      gsap.ticker.wake();
      sealRef.current = null;
      setLive(false);
    };
  }, [amount, symbol, reference]);

  return (
    <div className="relative">
      {/* The flat card is the default state, so a failed script never leaves an
          empty box where the money is supposed to be. */}
      <div className={live ? "pointer-events-none invisible" : undefined}>
        <EnvelopeCard
          amount={amount}
          symbol={symbol}
          caption={caption}
          reference={reference}
        />
      </div>

      <div
        ref={mountRef}
        className={`${live ? "" : "opacity-0"} absolute inset-0 transition-opacity duration-500`}
      />
    </div>
  );
}

/**
 * Draw the envelope face on a canvas: the security ruling, the airmail edge,
 * and the type. Reads the loaded families off the document so the texture uses
 * the same faces as the rest of the page rather than a system fallback.
 */
function drawFace({
  amount,
  symbol,
  reference,
}: {
  amount: string;
  symbol: string;
  reference?: string;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const styles = getComputedStyle(document.body);
  const display =
    styles.getPropertyValue("--font-plex-condensed").trim() || "sans-serif";
  const mono = styles.getPropertyValue("--font-plex-mono").trim() || "monospace";

  context.fillStyle = "#131c27";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // The ruling. Two rakes, as on the real stock.
  context.lineWidth = 1;
  for (const [angle, spacing, alpha] of [
    [0.62, 13, 0.2],
    [-0.62, 16, 0.14],
  ] as const) {
    context.strokeStyle = `rgba(53, 97, 159, ${alpha})`;
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(angle);
    for (let x = -canvas.width; x < canvas.width; x += spacing) {
      context.beginPath();
      context.moveTo(x, -canvas.height);
      context.lineTo(x, canvas.height);
      context.stroke();
    }
    context.restore();
  }

  // Airmail edge.
  const stripe = 26;
  for (let x = -canvas.height; x < canvas.width; x += stripe * 4) {
    context.fillStyle = "#c8443c";
    context.fillRect(x, 0, stripe, 14);
    context.fillStyle = "#35619f";
    context.fillRect(x + stripe * 2, 0, stripe, 14);
  }

  context.fillStyle = "#5d6979";
  context.font = `600 26px ${display}`;
  context.letterSpacing = "5px";
  context.fillText("CONTENTS", 74, 452);

  context.fillStyle = "#e9e4d7";
  context.font = `700 168px ${display}`;
  context.letterSpacing = "-4px";
  context.fillText(amount, 70, 606);

  const amountWidth = context.measureText(amount).width;
  context.fillStyle = "#9aa4b2";
  context.font = `600 44px ${display}`;
  context.letterSpacing = "8px";
  context.fillText(symbol, 78 + amountWidth + 22, 606);

  context.strokeStyle = "#24303f";
  context.setLineDash([7, 9]);
  context.beginPath();
  context.moveTo(74, 664);
  context.lineTo(canvas.width - 74, 664);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#5d6979";
  context.font = `600 26px ${display}`;
  context.letterSpacing = "5px";
  context.fillText("ADDRESSED TO", 74, 716);

  context.fillStyle = "#e9e4d7";
  context.font = `600 66px ${display}`;
  context.letterSpacing = "3px";
  context.fillText("BEARER", 74, 782);

  if (reference) {
    context.fillStyle = "#5d6979";
    context.font = `400 30px ${mono}`;
    context.letterSpacing = "0px";
    const label = `Ref. ${reference}`;
    context.fillText(label, canvas.width - 74 - context.measureText(label).width, 782);
  }

  return canvas;
}
