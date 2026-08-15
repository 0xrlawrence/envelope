/**
 * The sheet.
 *
 * The send-off folds the envelope card into a dart. For that to read as one
 * object rather than as a swap, the thing that folds has to be the card: same
 * size, same position on screen, same pixels. So the card is painted onto a
 * canvas here and used as the front face of a sheet of paper in the scene.
 *
 * The painting is driven by the live DOM rather than by a second copy of the
 * design. Every text run is read back from the element that rendered it, with
 * its computed font, colour and box, so clamped type scales and responsive
 * layout come out right without being restated. Only the backgrounds are
 * reimplemented, because those are patterns rather than content.
 */

const PAINT = "[data-paint]";

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** #rrggbb to rgba(), for the tint hatchings that are drawn at low alpha. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = Number.parseInt(match[1]!, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function fontOf(style: CSSStyleDeclaration): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/**
 * Where the alphabetic baseline sits inside an element's box.
 *
 * The font box is centred in the line box, so half the leading sits above the
 * ascender. Measuring it this way rather than assuming the top of the box is
 * what keeps `leading-none` headings, where the font box is taller than the
 * line box, from drifting upward.
 */
function baselineIn(ctx: CanvasRenderingContext2D, boxHeight: number): number {
  const metrics = ctx.measureText("Hg");
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  return (boxHeight - ascent - descent) / 2 + ascent;
}

function lineHeightOf(ctx: CanvasRenderingContext2D, style: CSSStyleDeclaration): number {
  const parsed = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(parsed)) return parsed;
  const metrics = ctx.measureText("Hg");
  return metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
}

/** The card, as it is on screen right now. */
export function paintCardFace(card: HTMLElement, scale: number): HTMLCanvasElement {
  const rect = card.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(rect.width * scale));
  canvas.height = Math.max(2, Math.round(rect.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  const ink = token("--ink", "#0e141c");
  const inkDeep = token("--ink-deep", "#080c11");
  const inkRaised = token("--ink-raised", "#151d29");
  const inkLine = token("--ink-line", "#24303f");
  const red = token("--airmail-red", "#c8443c");
  const blue = token("--airmail-blue", "#35619f");

  const width = rect.width;
  const height = rect.height;

  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, width, height);

  // The security tint: two counter-raked hatchings that beat against each other.
  const hatch = (degrees: number, alpha: number, period: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.fillStyle = withAlpha(blue, alpha);
    const reach = Math.hypot(width, height);
    for (let offset = -reach; offset <= reach; offset += period) {
      ctx.fillRect(-reach, offset, reach * 2, 1);
    }
    ctx.restore();
  };
  hatch(68, 0.22, 7);
  hatch(-68, 0.16, 9);

  // The flap seam, folded down over the top of the interior.
  const flapDepth = Math.min(112, height * 0.32);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width / 2, flapDepth);
  ctx.closePath();
  ctx.clip();
  const seam = ctx.createLinearGradient(0, 0, 0, flapDepth);
  seam.addColorStop(0, inkRaised);
  seam.addColorStop(1, withAlpha(ink, 0.88));
  ctx.fillStyle = seam;
  ctx.fillRect(0, 0, width, flapDepth);
  ctx.restore();

  // The airmail edge. One edge, one purpose: this is a thing that gets sent.
  const band = 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, band);
  ctx.clip();
  ctx.translate(width / 2, band / 2);
  ctx.rotate(-Math.PI / 4);
  const reach = Math.hypot(width, band);
  for (let offset = -reach; offset <= reach; offset += 32) {
    ctx.fillStyle = red;
    ctx.fillRect(-reach, offset, reach * 2, 8);
    ctx.fillStyle = inkDeep;
    ctx.fillRect(-reach, offset + 8, reach * 2, 8);
    ctx.fillStyle = blue;
    ctx.fillRect(-reach, offset + 16, reach * 2, 8);
    ctx.fillStyle = inkDeep;
    ctx.fillRect(-reach, offset + 24, reach * 2, 8);
  }
  ctx.restore();

  // The address block's dashed rule, and the card's own border.
  const rule = card.querySelector<HTMLElement>("[data-paint-rule]");
  if (rule) {
    const ruleRect = rule.getBoundingClientRect();
    ctx.save();
    ctx.strokeStyle = inkLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ruleRect.left - rect.left, ruleRect.top - rect.top + 0.5);
    ctx.lineTo(ruleRect.right - rect.left, ruleRect.top - rect.top + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = inkLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  // Every text run, read back from the element that rendered it.
  card.querySelectorAll<HTMLElement>(PAINT).forEach((element) => {
    const text = (element.textContent ?? "").trim();
    if (!text) return;

    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;

    const style = getComputedStyle(element);
    ctx.font = fontOf(style);
    ctx.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    ctx.fillStyle = style.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const body = style.textTransform === "uppercase" ? text.toUpperCase() : text;
    const left = box.left - rect.left;
    const top = box.top - rect.top;

    if (element.dataset.paint !== "wrap") {
      ctx.fillText(body, left, top + baselineIn(ctx, box.height));
      return;
    }

    const step = lineHeightOf(ctx, style);
    const first = top + baselineIn(ctx, step);
    let line = "";
    let row = 0;
    for (const word of body.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > box.width) {
        ctx.fillText(line, left, first + row * step);
        line = word;
        row += 1;
      } else {
        line = candidate;
      }
    }
    if (line) ctx.fillText(line, left, first + row * step);
  });

  ctx.letterSpacing = "0px";
  return canvas;
}

/**
 * The back of the same sheet: plain airmail paper.
 *
 * Drawn as it looks from behind, because that is the side it is read from once
 * the sheet turns over. The amount sits where the two wings will be, which is
 * the only writing that survives the fold: everything on the front folds inward
 * and is sealed inside the dart.
 */
export function paintPaperBack(
  card: HTMLElement,
  scale: number,
  spans: readonly number[],
  amount: string,
  symbol: string,
): HTMLCanvasElement {
  const rect = card.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  const width = Math.max(2, Math.round(rect.width * scale));
  const height = Math.max(2, Math.round(rect.height * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const red = token("--airmail-red", "#c8443c");
  const blue = token("--airmail-blue", "#35619f");

  ctx.fillStyle = "#f7f5f0";
  ctx.fillRect(0, 0, width, height);

  // The printed border, struck around all four edges of the sheet. Which of
  // them survive is decided by the fold: creases come out bare, cut edges keep
  // their stripe, which is exactly how a folded airmail envelope behaves.
  const margin = Math.round(Math.min(width, height) * 0.012);
  const depth = Math.round(Math.min(width, height) * 0.030);
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, width - margin * 2, height - margin * 2);
  ctx.rect(
    margin + depth,
    margin + depth,
    width - (margin + depth) * 2,
    height - (margin + depth) * 2,
  );
  ctx.clip("evenodd");
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 4);
  const inks = [red, blue, "#111820"];
  const dash = Math.max(6, Math.round(depth * 0.78));
  const reach = Math.hypot(width, height);
  for (let offset = -reach, index = 0; offset <= reach; offset += dash * 1.55, index += 1) {
    ctx.fillStyle = inks[index % inks.length]!;
    ctx.fillRect(-reach, offset, reach * 2, dash);
  }
  ctx.restore();

  // The amount, once per wing, reading toward the nose.
  const display =
    getComputedStyle(document.body).getPropertyValue("--font-plex-condensed").trim() ||
    "sans-serif";
  const unit = Math.min(width, height);
  for (const span of spans) {
    ctx.save();
    ctx.translate(span * width, 0.79 * height);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#141b25";
    ctx.font = `700 ${Math.round(unit * 0.15)}px ${display}`;
    ctx.fillText(amount, 0, 0);
    ctx.fillStyle = "#465365";
    ctx.font = `600 ${Math.round(unit * 0.048)}px ${display}`;
    ctx.letterSpacing = `${Math.round(unit * 0.014)}px`;
    ctx.fillText(symbol, 0, Math.round(unit * 0.075));
    ctx.restore();
  }

  ctx.letterSpacing = "0px";
  return canvas;
}
