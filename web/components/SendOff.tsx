"use client";

import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
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
 * The dart is folded from an airmail envelope, so the striped border it was
 * printed with ends up running along the folded edges. That striping is drawn
 * in the shader from each facet's own barycentric coordinates rather than
 * painted into a texture: the dashes march along whichever edge is nearest and
 * rake to a true 45 degrees across the band, so they stay crisp at any distance
 * and land exactly on the creases instead of near them.
 *
 * The amount is printed onto the near wing the same way, through the paper's
 * own lighting, so it creases and shades with the wing instead of hovering
 * beside it.
 */
const STREAKS = 320;

type Point = readonly [number, number, number];

/**
 * A folded facet.
 *
 * `stripe` names the edges that came from the envelope's printed border, by the
 * edge opposite each vertex: 0 is BC, 1 is CA, 2 is AB. Creases made by folding
 * are left bare, which is what keeps the striping reading as print rather than
 * as an outline.
 */
interface Facet {
  points: readonly [Point, Point, Point];
  stripe: readonly number[];
  mark?: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
}

const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const magnitude = (a: Point) => Math.hypot(a[0], a[1], a[2]);

function foldDart(facets: readonly Facet[]): BufferGeometry {
  const position: number[] = [];
  const bary: number[] = [];
  const edge: number[] = [];
  const span: number[] = [];
  const uv: number[] = [];
  const ink: number[] = [];

  for (const facet of facets) {
    const [a, b, c] = facet.points;
    const ab = subtract(b, a);
    const ac = subtract(c, a);
    const bc = subtract(c, b);

    // Twice the area, which turns an edge length into the height above it.
    const doubleArea = magnitude(cross(ab, ac));
    const lengths = [magnitude(bc), magnitude(ac), magnitude(ab)];
    const heights = lengths.map((length) => doubleArea / length);

    // Zero means "this edge is a fold, leave it bare". Anything else is the
    // height above that edge, which converts barycentric depth into a real
    // distance so the printed band is the same width on every facet.
    const printed = [0, 1, 2].map((index) =>
      facet.stripe.includes(index) ? heights[index]! : 0,
    );

    for (let vertex = 0; vertex < 3; vertex += 1) {
      position.push(...facet.points[vertex]!);
      bary.push(vertex === 0 ? 1 : 0, vertex === 1 ? 1 : 0, vertex === 2 ? 1 : 0);
      edge.push(printed[0]!, printed[1]!, printed[2]!);
      span.push(lengths[0]!, lengths[1]!, lengths[2]!);
      uv.push(...(facet.mark?.[vertex] ?? [0, 0]));
      ink.push(facet.mark ? 1 : 0);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute("aBary", new BufferAttribute(new Float32Array(bary), 3));
  geometry.setAttribute("aEdge", new BufferAttribute(new Float32Array(edge), 3));
  geometry.setAttribute("aSpan", new BufferAttribute(new Float32Array(span), 3));
  geometry.setAttribute("aUv", new BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute("aInk", new BufferAttribute(new Float32Array(ink), 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function SendOff({
  amount,
  symbol,
  phase,
  onDone,
}: {
  amount: string;
  symbol: string;
  /**
   * `flying` while the transaction is still being proved, then `sent` once the
   * envelope is confirmed on-chain, `returned` if the user declined it in the
   * wallet, or `failed` if it was signed and never arrived.
   *
   * A refusal is not a failure, and it should not look like one. Nothing was
   * sent, so the envelope comes back the way it went out instead of falling out
   * of the sky.
   */
  phase: "flying" | "sent" | "returned" | "failed";
  onDone?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const finished = useRef(false);

  // Held in refs so the scene is built exactly once. Taking these as effect
  // dependencies meant every parent render tore the scene down and started the
  // flight again, and the parent re-renders once a second while it counts the
  // wait, so the dart never got more than a second into the air.
  const latest = useRef({ amount, symbol, phase, onDone });
  latest.current = { amount, symbol, phase, onDone };

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
    // Above the flight line rather than level with it. A dart seen from the
    // side is a line; the wings, the creases and the printing only exist if you
    // are looking down on them.
    camera.position.set(0, 4.4, 6.0);
    camera.lookAt(0, 0.2, 0);

    scene.add(new AmbientLight(0xffffff, 0.62));
    const key = new DirectionalLight(0xffffff, 1.7);
    key.position.set(3.5, 6, 4);
    scene.add(key);
    const rim = new DirectionalLight(0x9fc0ff, 0.75);
    rim.position.set(-4, -1.5, 2);
    scene.add(rim);

    // ── The dart ───────────────────────────────────────────────────────────
    // A ridge running the length of the fuselage, a short wall stepping down
    // from it to each wing root, wings swept back from a long nose, a keel to
    // hold underneath, and the two folded corners lying proud of the wings.
    // That step is what makes it read as folded paper rather than as a shape:
    // without it the whole thing is one plane catching one light.
    const SPAN = 1.02;
    const LENGTH = 2.57;
    const NOSE: Point = [0, 0, 1.62];
    const RIDGE: Point = [0, 0.34, -0.95];
    const KEEL: Point = [0, -0.34, -0.9];
    // The wing root sits well outboard of the ridge and below it, so the body
    // is a tent rather than a wall. A vertical wall is edge on to a camera
    // level with the flight line and disappears; a slanted one catches its own
    // light and separates the two wings, which is what makes the fold read.
    const root = (side: number): Point => [side * 0.3, -0.02, -0.95];
    // A wing is a quad, not a sliver: it carries a tip chord, so there is an
    // open white field between the leading edge and the trailing edge rather
    // than two printed borders running into each other.
    const tipAft = (side: number): Point => [side * SPAN, -0.09, -0.95];
    const tipFore = (side: number): Point => [side * SPAN, -0.113, -0.28];

    // Lift a folded corner clear of the wing beneath it, along that wing's own
    // normal, so the layer draws its own shadow line instead of fighting for
    // the same depth. The wing is built flat on purpose, so one normal serves.
    const wingNormal = cross(subtract(tipAft(1), NOSE), subtract(root(1), NOSE));
    const wingUnit = magnitude(wingNormal);
    const LAYER = 0.028;
    const along = (from: Point, to: Point, t: number): Point => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
    const lift = (point: Point, side: number): Point => [
      point[0] + (side * wingNormal[0] * LAYER) / wingUnit,
      point[1] + (wingNormal[1] * LAYER) / wingUnit,
      point[2] + (wingNormal[2] * LAYER) / wingUnit,
    ];

    // The amount is printed on the near wing. Its coordinates run nose to tail
    // across the canvas and root to tip down it, which is the orientation the
    // wing presents once the dart is banked toward the camera.
    const markAt = (point: Point): readonly [number, number] => [
      (point[2] + 0.95) / LENGTH,
      1 - Math.abs(point[0]) / SPAN,
    ];

    // The one folded corner each wing carries: a long diagonal from just behind
    // the nose out to the trailing edge. Its other two sides lie along creases,
    // so the diagonal is the only line of print on it.
    const foldSeam = (side: number) =>
      [
        lift(along(NOSE, root(side), 0.12), side),
        lift(along(root(side), tipAft(side), 0.55), side),
        lift(root(side), side),
      ] as const;

    const dartGeometry = foldDart([
      // Body walls, stepping down from the ridge to each wing root. The step is
      // what makes the dart read as folded paper: without it the whole thing is
      // one surface catching one light. Only the back edge was a cut edge.
      { points: [NOSE, RIDGE, root(1)], stripe: [0] },
      { points: [NOSE, root(-1), RIDGE], stripe: [0] },
      // Keel. Belly edge AB, back edge BC, ridge bare.
      { points: [NOSE, KEEL, RIDGE], stripe: [0, 2] },
      // Far wing, as two triangles of one flat quad. The shared diagonal is
      // interior, so it is left bare and only the outline is printed.
      { points: [NOSE, tipFore(1), tipAft(1)], stripe: [0, 2] },
      { points: [NOSE, tipAft(1), root(1)], stripe: [0] },
      // Near wing, and the one that carries the printing.
      {
        points: [NOSE, tipAft(-1), tipFore(-1)],
        stripe: [0, 1],
        mark: [markAt(NOSE), markAt(tipAft(-1)), markAt(tipFore(-1))],
      },
      {
        points: [NOSE, root(-1), tipAft(-1)],
        stripe: [0],
        mark: [markAt(NOSE), markAt(root(-1)), markAt(tipAft(-1))],
      },
      // Folded corners: one printed diagonal each.
      { points: foldSeam(1), stripe: [2] },
      {
        points: [foldSeam(-1)[0], foldSeam(-1)[2], foldSeam(-1)[1]],
        stripe: [1],
      },
    ]);

    // The amount, drawn once onto a canvas and printed into the paper's own
    // diffuse colour, so it takes the wing's light and the wing's perspective.
    const label = document.createElement("canvas");
    label.width = 1120;
    label.height = 512;
    const context = label.getContext("2d");
    if (context) {
      const styles = getComputedStyle(document.body);
      const display = styles.getPropertyValue("--font-plex-condensed").trim() || "sans-serif";
      // Placed outboard of the folded corner and clear of the printed border,
      // in the open field of the wing where an address block would go.
      // A wing is a triangle, so the open field is the wedge aft of the folded
      // corner and inboard of the leading edge. The block is set left-aligned
      // and low in it, which is the widest part and the part that stays clear
      // of the printed border on every side.
      context.clearRect(0, 0, label.width, label.height);
      context.textAlign = "left";
      context.fillStyle = "#141b25";
      context.font = `700 110px ${display}`;
      context.fillText(amount, 60, 425);
      context.fillStyle = "#465365";
      context.font = `600 34px ${display}`;
      context.letterSpacing = "8px";
      context.fillText(symbol, 64, 470);
    }
    const labelTexture = new CanvasTexture(label);
    labelTexture.colorSpace = SRGBColorSpace;
    labelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const paper = new MeshStandardMaterial({
      color: 0xf7f5f0,
      roughness: 0.93,
      metalness: 0,
      flatShading: true,
      side: DoubleSide,
    });

    paper.onBeforeCompile = (shader) => {
      shader.uniforms.uMark = { value: labelTexture };
      shader.uniforms.uInkA = { value: new Color(0xc8443c) };
      shader.uniforms.uInkB = { value: new Color(0x35619f) };
      shader.uniforms.uInkC = { value: new Color(0x111820) };

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec3 aBary;
attribute vec3 aEdge;
attribute vec3 aSpan;
attribute vec2 aUv;
attribute float aInk;
varying vec3 vBary;
varying vec3 vEdge;
varying vec3 vSpan;
varying vec2 vMark;
varying float vInk;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vBary = aBary;
vEdge = aEdge;
vSpan = aSpan;
vMark = aUv;
vInk = aInk;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform sampler2D uMark;
uniform vec3 uInkA;
uniform vec3 uInkB;
uniform vec3 uInkC;
varying vec3 vBary;
varying vec3 vEdge;
varying vec3 vSpan;
varying vec2 vMark;
varying float vInk;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
  // Printed first, so a border stripe always wins over the amount.
  if (vInk > 0.5) {
    vec4 stamp = texture2D(uMark, vMark);
    diffuseColor.rgb = mix(diffuseColor.rgb, pow(stamp.rgb, vec3(2.2)), stamp.a);
  }

  // Distance to the nearest printed edge, in model units, and how far along
  // that edge we are, so the dashes march with the edge rather than across it.
  float dist = 1e9;
  float along = 0.0;
  if (vEdge.x > 0.0) {
    float d = vBary.x * vEdge.x;
    if (d < dist) { dist = d; along = vBary.z / max(vBary.y + vBary.z, 1e-4) * vSpan.x; }
  }
  if (vEdge.y > 0.0) {
    float d = vBary.y * vEdge.y;
    if (d < dist) { dist = d; along = vBary.x / max(vBary.z + vBary.x, 1e-4) * vSpan.y; }
  }
  if (vEdge.z > 0.0) {
    float d = vBary.z * vEdge.z;
    if (d < dist) { dist = d; along = vBary.y / max(vBary.x + vBary.y, 1e-4) * vSpan.z; }
  }

  // A hairline of bare paper at the very edge, then the band. Kept narrow:
  // printed borders on an envelope are a trim, and a fat one turns every fold
  // into a stripe and leaves no white paper between them.
  float soft = fwidth(dist) + 1e-5;
  float band =
    smoothstep(0.006 - soft, 0.006 + soft, dist) *
    (1.0 - smoothstep(0.045 - soft, 0.045 + soft, dist));

  if (band > 0.001) {
    // Adding the across-band distance to the along-edge distance rakes every
    // dash to exactly 45 degrees, which is what airmail border printing is.
    float phase = (along + dist) * 16.0;
    float cell = mod(floor(phase), 3.0);
    vec3 ink = cell < 1.0 ? uInkA : (cell < 2.0 ? uInkB : uInkC);
    float dash = smoothstep(0.74, 0.62, fract(phase));
    diffuseColor.rgb = mix(diffuseColor.rgb, ink, band * dash);
  }`,
        );
    };

    const dart = new Mesh(dartGeometry, paper);

    // The dart is modelled nose-along-Z, so an inner group turns it to face
    // right and the outer group is left free to carry position and tilt. The
    // nose then stays pointing right whatever the tilt is doing.
    const heading = new Group();
    heading.rotation.y = Math.PI / 2;
    heading.add(dart);

    const plane = new Group();
    plane.add(heading);
    // Large enough that the fold and the printing are legible, which is the
    // whole point of showing it.
    plane.scale.setScalar(1.15);

    plane.position.set(-2.6, -0.4, 0);
    plane.rotation.set(0, 0, 0.1);
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

    // All of it behind the dart. A streak crossing in front cuts a bright line
    // across the paper, which reads as a rendering fault rather than as air.
    const seeds = Array.from({ length: STREAKS }, () => ({
      x: Math.random() * 26 - 13,
      y: Math.random() * 11 - 5.5,
      z: -0.9 - Math.random() * 6,
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
    const AWAY = 1.3;
    // A turn takes longer than a departure, and it should: the point of it is
    // that you can see the envelope decide to come back.
    const BACK = 1.9;
    // Banked toward the camera, on top of whatever the drift is doing, so the
    // wings and the printing stay presented rather than edge on. Kept shallow,
    // with most of the viewing angle coming from the camera's height instead:
    // bank alone presents the near wing by hiding the far one.
    const BANK = 0.34;
    // When the throw ends the dart does not leave. It holds in the middle of
    // the page, gliding, for as long as the transaction is still being proved,
    // so the wait has something happening in it and the exit means something
    // when it comes.
    const CRUISE_START = GATHER + THROW;

    let exitAt = 0;

    let frame = 0;
    const started = performance.now();
    let last = started;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = (now - started) / 1000;

      // Tilt only. Three sines that do not share a period, so the drift never
      // visibly repeats without ever being random enough to jolt.
      const tiltZ =
        0.10 * Math.sin(elapsed * 0.9) +
        0.06 * Math.sin(elapsed * 1.73 + 1.3) +
        0.035 * Math.sin(elapsed * 2.91 + 0.4);
      const tiltX =
        BANK +
        0.13 * Math.sin(elapsed * 0.71 + 2.1) +
        0.06 * Math.sin(elapsed * 1.87 + 0.8);

      if (elapsed < GATHER) {
        // Drawing back, the way a hand does before a throw.
        const t = elapsed / GATHER;
        plane.position.set(at(t, -2.6, -3.15, easeIn), at(t, -0.4, -0.75, easeIn), 0);
        plane.rotation.set(tiltX, 0, at(t, 0.1, 0.26, easeIn));
      } else if (elapsed < GATHER + THROW) {
        const t = (elapsed - GATHER) / THROW;
        plane.position.set(at(t, -3.15, 1.3, easeOut), at(t, -0.75, 0.55, easeOut), 0);
        plane.rotation.set(tiltX, 0, at(t, 0.26, tiltZ, easeOut));
      } else if (!exitAt) {
        // Cruising. A slow bob and roll, so it reads as held aloft rather than
        // parked, and it keeps this up for as long as the wallet needs.
        const t = elapsed - CRUISE_START;
        plane.position.set(
          0.55 + Math.sin(t * 0.42) * 0.55,
          0.35 + Math.sin(t * 0.73) * 0.22,
          Math.sin(t * 0.31) * 0.4,
        );
        plane.rotation.set(tiltX, 0, tiltZ);

        const settledPhase = latest.current.phase;
        if (settledPhase !== "flying") exitAt = elapsed;
      } else {
        const span = latest.current.phase === "returned" ? BACK : AWAY;
        const t = (elapsed - exitAt) / span;
        if (latest.current.phase === "returned") {
          // Declined. Nothing was signed and nothing moved, so the envelope is
          // not lost: it banks over and comes back the way it went out. It
          // leaves to the left, which is where the page slid away to, so the
          // form arriving back behind it reads as the same movement reversed.
          const turn = Math.min(t / 0.42, 1);
          plane.position.set(
            at(t, 0.55, -13, easeIn),
            at(t, 0.35, -0.65, easeOut),
            at(t, 0, 1.1, easeOut),
          );
          plane.rotation.set(tiltX - turn * 0.55, turn * Math.PI, tiltZ - turn * 0.2);
        } else if (latest.current.phase === "failed") {
          // Signed, and then it never arrived. That is a fall, not a return.
          plane.position.set(
            at(t, 0.55, -0.6, easeIn),
            at(t, 0.35, -5.5, easeIn),
            at(t, 0, 1.2, easeIn),
          );
          plane.rotation.set(tiltX, 0, at(t, tiltZ, 0.85, easeIn));
        } else {
          plane.position.set(
            at(t, 0.55, 14, easeIn),
            at(t, 0.35, 2.6, easeIn),
            at(t, 0, -3.5, easeIn),
          );
          plane.rotation.set(tiltX, 0, tiltZ);
        }
      }

      const leaving = latest.current.phase === "returned" ? BACK : AWAY;

      // Wind holds while it cruises and drops away with it.
      const rise = Math.min(elapsed / 0.5, 1);
      const fall = exitAt
        ? 1 - Math.min(Math.max((elapsed - exitAt) / leaving, 0), 1)
        : 1;
      streakMaterial.opacity = 0.55 * rise * fall;

      layoutStreaks(delta);
      renderer.render(scene, camera);

      if (exitAt && elapsed > exitAt + leaving) settle();
    };
    frame = requestAnimationFrame(loop);


    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      dartGeometry.dispose();
      paper.dispose();
      streakGeometry.dispose();
      streakMaterial.dispose();
      streaks.dispose();
      labelTexture.dispose();
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
