import { resolveRenderOptions } from "./options.ts";

import type { LogoSpec, QrMatrix, QxRenderOptions } from "./types.ts";

const ROUND_RADIUS = 1;

type CutoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SvgLogoLayout = {
  cutout: CutoutBox;
  image: CutoutBox;
  source: string;
};

type MoveKey = CardinalMoveKey | CornerMoveKey;
type CardinalMoveKey = "u" | "r" | "d" | "l";
type CornerMoveKey = "ld" | "ul" | "ru" | "dr" | "ur" | "rd" | "dl" | "lu";
type DirectionKey = "u" | "r" | "d" | "l";
type PathDir = 0 | 1;

type PathState = {
  x: number;
  y: number;
  dir: PathDir;
};

type PathContext = {
  lpaths: string[];
  moves: Record<MoveKey, string>;
  filled: boolean[][];
};

const DIRECTION_VECTORS: Record<DirectionKey, [number, number]> = {
  u: [0, -1],
  r: [1, 0],
  d: [0, 1],
  l: [-1, 0],
};

const OUTER_MOVE_PREFIX: Record<DirectionKey, string> = {
  u: "v-",
  r: "h",
  d: "v",
  l: "h-",
};

const INNER_MOVE_SUFFIX: Record<DirectionKey, string> = {
  u: "v-",
  r: "h",
  d: "v",
  l: "h-",
};

const CORNER_KEYS = ["ld", "ul", "ru", "dr", "ur", "rd", "dl", "lu"] as const satisfies readonly CornerMoveKey[];

export function toSvg(matrix: QrMatrix, opts: QxRenderOptions = {}): string {
  const resolved = resolveRenderOptions(opts);
  const rounded = resolved.rounded;
  const totalSize = matrix.size + resolved.margin * 2;
  const marginUnits = resolved.margin * 2;
  const logo = layoutLogo(matrix, resolved.margin, resolved.logo);
  const unitScale = rounded ? 2 : 1;
  const totalUnits = totalSize * unitScale;
  const darkAt = createDarkPredicate(matrix, resolved.margin, logo?.cutout);
  const foregroundMarkup = rounded
    ? buildRoundedMarkup(matrix, marginUnits, resolved.foreground, darkAt)
    : buildSquareMarkup(matrix, resolved.margin, resolved.foreground, darkAt);
  const shapeRendering = rounded ? "geometricPrecision" : "crispEdges";
  const svgWidth = rounded ? totalUnits : totalSize;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalUnits} ${totalUnits}" width="${svgWidth}" height="${svgWidth}" role="img" aria-label="QR code" shape-rendering="${shapeRendering}">`,
    `<rect width="${totalUnits}" height="${totalUnits}" fill="${escapeXml(resolved.background)}"/>`,
    foregroundMarkup,
  ];

  if (logo) {
    const logoScale = rounded ? 2 : 1;
    parts.push(
      `<image x="${logo.image.x * logoScale}" y="${logo.image.y * logoScale}" width="${logo.image.width * logoScale}" height="${logo.image.height * logoScale}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(logo.source)}" xlink:href="${escapeXml(logo.source)}"/>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

function layoutLogo(matrix: QrMatrix, margin: number, logo?: LogoSpec): SvgLogoLayout | undefined {
  if (!logo) {
    return undefined;
  }

  if (!isDataUrl(logo.source)) {
    throw new Error(
      "toSvg() only supports logo.source values that are already data URLs. Use qxcode() for file paths and remote URLs.",
    );
  }

  validateLogoDimensions(logo);

  const padding = logo.padding ?? 0;
  const imageX = margin + Math.floor((matrix.size - logo.width) / 2);
  const imageY = margin + Math.floor((matrix.size - logo.height) / 2);
  const cutout = {
    x: imageX - padding,
    y: imageY - padding,
    width: logo.width + padding * 2,
    height: logo.height + padding * 2,
  };

  if (
    cutout.x < margin ||
    cutout.y < margin ||
    cutout.x + cutout.width > margin + matrix.size ||
    cutout.y + cutout.height > margin + matrix.size
  ) {
    throw new Error("The requested logo cutout does not fit within the QR matrix.");
  }

  return {
    cutout,
    image: {
      x: imageX,
      y: imageY,
      width: logo.width,
      height: logo.height,
    },
    source: logo.source,
  };
}

function validateLogoDimensions(logo: LogoSpec): void {
  for (const [label, value] of [
    ["width", logo.width],
    ["height", logo.height],
    ["padding", logo.padding ?? 0],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`logo.${label} must be a non-negative integer in modules.`);
    }
  }

  if (logo.width <= 0 || logo.height <= 0) {
    throw new Error("logo.width and logo.height must both be greater than 0.");
  }
}

function createDarkPredicate(matrix: QrMatrix, margin: number, cutout?: CutoutBox): (x: number, y: number) => boolean {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) {
      return false;
    }

    const svgX = x + margin;
    const svgY = y + margin;

    if (
      cutout &&
      svgX + 1 > cutout.x &&
      svgY + 1 > cutout.y &&
      svgX < cutout.x + cutout.width &&
      svgY < cutout.y + cutout.height
    ) {
      return false;
    }

    return matrix.modules[y]![x] === true;
  };
}

function buildSquareMarkup(
  matrix: QrMatrix,
  margin: number,
  foreground: string,
  darkAt: (x: number, y: number) => boolean,
): string {
  const elements: string[] = [];

  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!darkAt(x, y)) {
        continue;
      }

      const svgX = x + margin;
      const svgY = y + margin;
      elements.push(`<path d="M${svgX} ${svgY}h1v1H${svgX}Z"/>`);
    }
  }

  return `<g fill="${escapeXml(foreground)}">${elements.join("")}</g>`;
}

function buildRoundedMarkup(
  matrix: QrMatrix,
  marginUnits: number,
  foreground: string,
  darkAt: (x: number, y: number) => boolean,
): string {
  const bodyMatrix = buildRoundedBodyMatrix(matrix, darkAt);
  const bodyPath = generateSvgPath(bodyMatrix, ROUND_RADIUS);
  const eyes = generateEyes(matrix.size, foreground);
  const body = bodyPath.length === 0 ? "" : `<path d="${bodyPath}" fill="${escapeXml(foreground)}" fill-rule="evenodd"/>`;

  return `<g transform="translate(${marginUnits} ${marginUnits})">${body}${eyes}</g>`;
}

function buildRoundedBodyMatrix(matrix: QrMatrix, darkAt: (x: number, y: number) => boolean): boolean[][] {
  const body: boolean[][] = [];

  for (let y = 0; y < matrix.size; y++) {
    body[y] = [];
    for (let x = 0; x < matrix.size; x++) {
      body[y]![x] = !isInEyeArea(x, y, matrix.size) && darkAt(x, y);
    }
  }

  return body;
}

function generateSvgPath(matrix: boolean[][], radius: number): string {
  const size = matrix.length;
  const moves = generateMoves(radius);
  const drawn = Array.from({ length: size * 2 + 3 }, () => Array.from({ length: size + 1 }, () => false));
  const filled = [Array.from({ length: size }, () => false), ...matrix, Array.from({ length: size }, () => false)].map(
    (row) => [false, ...row, false],
  );

  const paths: string[] = [];

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size * 2; y += 2) {
      if (drawn[y]![x] || filled[y / 2]![x + 1] || !filled[y / 2 + 1]![x + 1]) {
        continue;
      }

      const lpaths = [`M${x * 2 + 1} ${y}`];
      const context: PathContext = { lpaths, moves, filled };
      let state: PathState = { x, y, dir: 0 };

      while (!drawn[state.y]![state.x]) {
        drawn[state.y]![state.x] = true;
        state = processPathDirection(state, context);
      }

      paths.push(lpaths.join(""));
    }
  }

  return paths.join("");
}

function generateMoves(radius: number): Record<MoveKey, string> {
  const moves: Record<MoveKey, string> = {
    u: "v-2",
    r: "h2",
    d: "v2",
    l: "h-2",
    ld: "",
    ul: "",
    ru: "",
    dr: "",
    ur: "",
    rd: "",
    dl: "",
    lu: "",
  };

  for (const [index, key] of CORNER_KEYS.entries()) {
    const from = key[0] as DirectionKey;
    const to = key[1] as DirectionKey;
    const fromVector = DIRECTION_VECTORS[from];
    const toVector = DIRECTION_VECTORS[to];
    moves[key] =
      (radius < 1 ? `${OUTER_MOVE_PREFIX[from]}${1 - radius}` : "") +
      `a${radius},${radius} 0 0,${index > 3 ? 1 : 0} ${(fromVector[0] + toVector[0]) * radius},${(fromVector[1] + toVector[1]) * radius}` +
      (radius < 1 ? `${INNER_MOVE_SUFFIX[to]}${1 - radius}` : "");
  }

  return moves;
}

function processPathDirection(state: PathState, context: PathContext): PathState {
  switch ((state.y % 2) * 2 + state.dir) {
    case 0:
      return handleRightPath(state, context);
    case 1:
      return handleLeftPath(state, context);
    case 2:
      return handleUpPath(state, context);
    case 3:
      return handleDownPath(state, context);
    default:
      return state;
  }
}

function handleRightPath(state: PathState, context: PathContext): PathState {
  const newX = state.x + 1;

  if (context.filled[state.y / 2 + 1]![newX + 1]) {
    if (context.filled[state.y / 2]![newX + 1]) {
      context.lpaths.push(context.moves.ru);
      return { x: newX, y: state.y - 1, dir: 0 };
    }

    context.lpaths.push(context.moves.r);
    return { x: newX, y: state.y, dir: state.dir };
  }

  context.lpaths.push(context.moves.rd);
  return { x: newX, y: state.y + 1, dir: 1 };
}

function handleLeftPath(state: PathState, context: PathContext): PathState {
  if (context.filled[state.y / 2]![state.x]) {
    if (context.filled[state.y / 2 + 1]![state.x]) {
      context.lpaths.push(context.moves.ld);
      return { x: state.x, y: state.y + 1, dir: 1 };
    }

    context.lpaths.push(context.moves.l);
    return { x: state.x - 1, y: state.y, dir: state.dir };
  }

  context.lpaths.push(context.moves.lu);
  return { x: state.x, y: state.y - 1, dir: 0 };
}

function handleUpPath(state: PathState, context: PathContext): PathState {
  if (context.filled[(state.y - 1) / 2]![state.x + 1]) {
    if (context.filled[(state.y - 1) / 2]![state.x]) {
      context.lpaths.push(context.moves.ul);
      return { x: state.x - 1, y: state.y - 1, dir: 1 };
    }

    context.lpaths.push(context.moves.u);
    return { x: state.x, y: state.y - 2, dir: 0 };
  }

  context.lpaths.push(context.moves.ur);
  return { x: state.x, y: state.y - 1, dir: 0 };
}

function handleDownPath(state: PathState, context: PathContext): PathState {
  if (context.filled[(state.y + 3) / 2]![state.x]) {
    if (context.filled[(state.y + 3) / 2]![state.x + 1]) {
      context.lpaths.push(context.moves.dr);
      return { x: state.x, y: state.y + 1, dir: 0 };
    }

    context.lpaths.push(context.moves.d);
    return { x: state.x, y: state.y + 2, dir: 1 };
  }

  context.lpaths.push(context.moves.dl);
  return { x: state.x - 1, y: state.y + 1, dir: 1 };
}

function generateEyes(size: number, foreground: string): string {
  const radius = Math.max(0.5, ROUND_RADIUS * 3);
  const positions = [
    [0, 0],
    [size * 2 - 14, 0],
    [0, size * 2 - 14],
  ] as const;

  return positions
    .map(([x, y]) => `<path d="${generateEyePath(x, y, radius)}" fill="${escapeXml(foreground)}" fill-rule="evenodd"/>`)
    .join("");
}

function generateEyePath(x: number, y: number, radius: number): string {
  const outer = `M${x + radius},${y}h${14 - 2 * radius}a${radius},${radius} 0 0,1 ${radius},${radius}v${14 - 2 * radius}a${radius},${radius} 0 0,1 -${radius},${radius}h-${14 - 2 * radius}a${radius},${radius} 0 0,1 -${radius},-${radius}v-${14 - 2 * radius}a${radius},${radius} 0 0,1 ${radius},-${radius}z`;
  const innerRadius = radius * 0.7;
  const inner = `M${x + 2 + innerRadius},${y + 2}a${innerRadius},${innerRadius} 0 0,0 -${innerRadius},${innerRadius}v${10 - 2 * innerRadius}a${innerRadius},${innerRadius} 0 0,0 ${innerRadius},${innerRadius}h${10 - 2 * innerRadius}a${innerRadius},${innerRadius} 0 0,0 ${innerRadius},-${innerRadius}v-${10 - 2 * innerRadius}a${innerRadius},${innerRadius} 0 0,0 -${innerRadius},-${innerRadius}h-${10 - 2 * innerRadius}z`;
  const centerRadius = radius * 0.5;
  const center = `M${x + 4 + centerRadius},${y + 4}h${6 - 2 * centerRadius}a${centerRadius},${centerRadius} 0 0,1 ${centerRadius},${centerRadius}v${6 - 2 * centerRadius}a${centerRadius},${centerRadius} 0 0,1 -${centerRadius},${centerRadius}h-${6 - 2 * centerRadius}a${centerRadius},${centerRadius} 0 0,1 -${centerRadius},-${centerRadius}v-${6 - 2 * centerRadius}a${centerRadius},${centerRadius} 0 0,1 ${centerRadius},-${centerRadius}z`;

  return `${outer}${inner}${center}`;
}

function isInEyeArea(x: number, y: number, size: number): boolean {
  if (x < 7 && y < 7) {
    return true;
  }

  if (x >= size - 7 && y < 7) {
    return true;
  }

  if (x < 7 && y >= size - 7) {
    return true;
  }

  return false;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}
