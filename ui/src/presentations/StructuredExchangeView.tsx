import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  StructuredElement,
  StructuredGraphData,
  StructuredSequenceData,
  StructuredTableData,
  ValidatedStructuredExchange,
} from "@pi-outpost/shared/structured-exchange";
import {
  describeStructure,
  displayLabel,
  elementRole,
  fieldChanges,
  layoutGraph,
  relationshipRole,
  ROLE_LABEL,
  toMermaid,
  validStructuredExchange,
  type ChangeRole,
} from "./structuredExchange";
import type { PresentationProps, ToolItem } from "./types";

/**
 * Structured exchange: data a tool declared about itself, rendered from that data
 * rather than from anything it wrote for display.
 *
 * When the envelope names a target it is a proposal, and this rendering is the
 * approval gate before it is applied somewhere. Two consequences run through
 * everything below. Nothing is summarised or sampled — what the reader sees is
 * what would be applied. And every value is rendered as text, never as markup:
 * this content comes from outside and is data, not instructions.
 *
 * The diagrams are **native SVG** — `rect` and `text`, with colours as attributes
 * rather than classes. An earlier version put HTML inside `foreignObject`, which
 * reads the same on screen and is useless the moment the picture has to go
 * anywhere else: serialize it and the styling is left behind, rasterize it and the
 * foreign content comes out blank. A diagram nobody can paste into a document is a
 * diagram that stops at the edge of this application.
 */

/* ── Palette ────────────────────────────────────────────────────────────────── */

/**
 * Explicit colours, and a ground to sit on.
 *
 * Attributes rather than classes, because a copied SVG carries its attributes and
 * leaves its stylesheet behind. One palette serves both themes: the diagram is a
 * figure with its own white ground, the way an exported chart is, rather than
 * something that changes with the page around it.
 */
const PAPER = "#ffffff";
const INK = "#27272a";
const MUTED = "#71717a";

const ROLE_PAINT: Record<ChangeRole, { fill: string; stroke: string; text: string }> = {
  added: { fill: "#ecfdf5", stroke: "#059669", text: "#065f46" },
  changed: { fill: "#fffbeb", stroke: "#d97706", text: "#92400e" },
  context: { fill: "#fafafa", stroke: "#d4d4d8", text: "#71717a" },
  unchanged: { fill: "#ffffff", stroke: "#a1a1aa", text: INK },
};

const RELATIONSHIP_PAINT: Record<ChangeRole, string> = {
  added: "#059669",
  changed: "#d97706",
  context: "#d4d4d8",
  unchanged: "#a1a1aa",
};

const ROLES: ChangeRole[] = ["added", "changed", "context", "unchanged"];

/**
 * Colour by type, emphasis by role.
 *
 * The contract carries a producer's own type for a thing — "block", "sensor",
 * "power", "thermal" — and never a colour. Presentation in the document would be
 * meaningless to whatever applies the proposal, which has its own styling, and it
 * would fight the one signal this view exists to carry: what is changing. So the
 * type picks the fill and the role can always override the outline.
 *
 * The assignment is a hash rather than a registry, so the same type draws the same
 * colour in every session and every diagram without anyone maintaining a mapping.
 * Nothing downstream depends on which colour a type gets, only that it is stable.
 */
const KIND_TINTS: { fill: string; stroke: string }[] = [
  { fill: "#eff6ff", stroke: "#2563eb" },
  { fill: "#f5f3ff", stroke: "#7c3aed" },
  { fill: "#ecfeff", stroke: "#0891b2" },
  { fill: "#fff1f2", stroke: "#e11d48" },
  { fill: "#f7fee7", stroke: "#65a30d" },
  { fill: "#fff7ed", stroke: "#ea580c" },
  { fill: "#f0fdfa", stroke: "#0d9488" },
  { fill: "#fdf4ff", stroke: "#c026d3" },
  { fill: "#fefce8", stroke: "#ca8a04" },
  { fill: "#f8fafc", stroke: "#475569" },
  { fill: "#eef2ff", stroke: "#4f46e5" },
  { fill: "#fef2f2", stroke: "#b91c1c" },
  { fill: "#f0fdf4", stroke: "#16a34a" },
  { fill: "#fdf2f8", stroke: "#db2777" },
  { fill: "#f5f5f4", stroke: "#78716c" },
  { fill: "#f0f9ff", stroke: "#0369a1" },
];

type Tint = { fill: string; stroke: string };

/** FNV-1a, for a preferred slot that depends only on the name. */
function hashOf(kind: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < kind.length; index++) {
    hash ^= kind.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * A colour per type, distinct within the diagram.
 *
 * The hash alone was wrong, and wrong in a way that only showed on real data: five
 * types drew in four colours, because five names into ten slots collide about seven
 * times in ten. Two types rendered identically while the key beside them insisted
 * they differed — worse than no colour at all, because it reads as information.
 *
 * So the hash picks a preferred slot and a taken slot probes forward. A name keeps
 * the same colour across documents when nothing contends for it, and two types in
 * one diagram are never the same colour until the palette is genuinely exhausted.
 * Distinctness wins the trade: stability across documents is a convenience, two
 * things that look alike and are not is a misreading.
 */
export const KIND_TINT_COUNT = KIND_TINTS.length;

export function assignTints(kinds: string[]): Map<string, Tint> {
  const assigned = new Map<string, Tint>();
  const taken = new Set<number>();
  for (const kind of kinds) {
    let slot = hashOf(kind) % KIND_TINTS.length;
    for (let probe = 0; probe < KIND_TINTS.length && taken.has(slot); probe++) {
      slot = (slot + 1) % KIND_TINTS.length;
    }
    taken.add(slot);
    assigned.set(kind, KIND_TINTS[slot]);
  }
  return assigned;
}

/** The types present, in the order they first appear, so the legend is stable too. */
export function kindsPresent(things: { kind?: string }[]): string[] {
  const seen: string[] = [];
  for (const thing of things) {
    if (thing.kind !== undefined && thing.kind !== "" && !seen.includes(thing.kind)) seen.push(thing.kind);
  }
  return seen;
}

/** Which vocabulary a type name belongs to. */
export type FilterScope = "element" | "relationship";

/**
 * A type name qualified by what it is a type of.
 *
 * The two vocabularies are independent and may share a word, so they cannot share a
 * namespace: with a bare name, a graph whose blocks and whose connections both used
 * "power" lost both when the reader hid either.
 */
export function filterKey(of: FilterScope, kind: string): string {
  return `${of}:${kind}`;
}

const LEGEND_ROW = 17;
const LEGEND_GAP = 18;
const LEGEND_TITLE = 92;

/**
 * How wide the key is allowed to run, whatever the canvas measures.
 *
 * Wrapping at the diagram's own width, a thirty-three element architecture three
 * thousand pixels across laid its key out across all three thousand — entries so far
 * apart that scanning for one meant scrolling. A key is read as a block, and the
 * block does not get wider because the drawing did.
 */
const LEGEND_MEASURE = 860;

/** The width the key wraps at: its own measure, or the canvas when that is narrower. */
function legendMeasure(width: number): number {
  return Math.min(width, LEGEND_MEASURE);
}

/** One line of the key: what the swatches mean, and the swatches. */
export type LegendEntry = {
  label: string;
  fill: string;
  stroke: string;
  dashed?: boolean;
  /** Set when this entry names a type the reader can show and hide. */
  toggles?: boolean;
  /** The qualified name this entry switches — see `filterKey`. */
  key?: string;
  hidden?: boolean;
};

export type LegendGroup = {
  title: string;
  sample: "box" | "line";
  entries: LegendEntry[];
};

function entryWidth(label: string): number {
  // Room for the " (hidden)" a switched-off entry grows, so the key does not reflow
  // under the reader as they toggle things.
  return 16 + 5 + (label.length + 9) * 5.6 + LEGEND_GAP;
}

/** Rows a group needs, so the canvas can make room before anything is drawn. */
function groupRows(group: LegendGroup, width: number): number {
  const measure = legendMeasure(width);
  let rows = 1;
  let cursor = 0;
  for (const entry of group.entries) {
    const needed = entryWidth(entry.label);
    if (cursor > 0 && LEGEND_TITLE + cursor + needed > measure - 20) {
      rows += 1;
      cursor = 0;
    }
    cursor += needed;
  }
  return rows;
}

/**
 * The narrowest canvas the key can be laid out on without anything falling off it.
 *
 * The schema allows a type name of a hundred characters, and the canvas width came
 * from the graph alone — so a narrow diagram with long type names drew a key that ran
 * past the viewBox and was simply cut. Wrapping cannot rescue an entry that is wider
 * than every line available to it, so the widest single entry sets a floor.
 */
function legendMinimumWidth(groups: LegendGroup[]): number {
  const widest = groups
    .flatMap((group) => group.entries)
    .reduce((wide, entry) => Math.max(wide, entryWidth(entry.label)), 0);
  return widest === 0 ? 0 : Math.min(LEGEND_TITLE + widest + 32, LEGEND_MEASURE);
}

/** How tall the whole key will be. */
function legendHeight(groups: LegendGroup[], width: number): number {
  const populated = groups.filter((group) => group.entries.length > 0);
  if (populated.length === 0) return 0;
  return populated.reduce((rows, group) => rows + groupRows(group, width), 0) * LEGEND_ROW + 12;
}

/**
 * The key to the picture, inside the picture.
 *
 * Drawn in the SVG rather than beside it in HTML, because the diagram is meant to
 * leave this application — a legend that stays behind on the page turns the
 * exported figure into a set of unexplained colours.
 *
 * Elements and relationships get a line each, and a relationship's swatch is a line
 * rather than a box: run together, a reader had to work out which of two vocabularies
 * a name belonged to, which is the one thing a key must not make them do.
 */
function Legend({
  groups,
  x,
  y,
  width,
  onToggle,
}: {
  groups: LegendGroup[];
  x: number;
  y: number;
  width: number;
  onToggle?: (kind: string) => void;
}) {
  const populated = groups.filter((group) => group.entries.length > 0);
  if (populated.length === 0) return null;

  const measure = legendMeasure(width);
  let row = 0;

  return (
    <g data-testid="diagram-legend">
      {populated.map((group) => {
        const startedAt = row;
        let cursor = 0;

        const drawn = group.entries.map((entry) => {
          const needed = entryWidth(entry.label);
          if (cursor > 0 && LEGEND_TITLE + cursor + needed > measure - 20) {
            row += 1;
            cursor = 0;
          }
          const at = x + LEGEND_TITLE + cursor;
          const top = y + row * LEGEND_ROW;
          cursor += needed;

          return (
            <g
              key={entry.label}
              data-legend-entry={entry.key ?? entry.label}
              data-hidden={entry.hidden === true ? "true" : undefined}
              onClick={
                entry.toggles === true && entry.key !== undefined && onToggle !== undefined
                  ? () => onToggle(entry.key!)
                  : undefined
              }
              style={entry.toggles === true ? { cursor: "pointer" } : undefined}
              opacity={entry.hidden === true ? 0.45 : 1}
            >
              {/* A generous hit area, since the swatch itself is ten pixels tall */}
              {entry.toggles === true && (
                <rect x={at - 3} y={top - 3} width={entryWidth(entry.label) - 8} height={16} fill="transparent" />
              )}
              {group.sample === "line" ? (
                <line
                  x1={at}
                  y1={top + 5}
                  x2={at + 16}
                  y2={top + 5}
                  stroke={entry.stroke}
                  strokeWidth={1.6}
                  strokeDasharray={entry.dashed === true ? "3 2" : undefined}
                />
              ) : (
                <rect
                  x={at}
                  y={top}
                  width={16}
                  height={10}
                  rx={2}
                  fill={entry.fill}
                  stroke={entry.stroke}
                  strokeWidth={1.2}
                  strokeDasharray={entry.dashed === true ? "3 2" : undefined}
                />
              )}
              <text x={at + 21} y={top + 9} fontSize={9} fill={MUTED} fontFamily="system-ui, sans-serif">
                {entry.hidden === true ? `${entry.label} (hidden)` : entry.label}
              </text>
            </g>
          );
        });

        const title = (
          <text
            key={`${group.title}-title`}
            data-testid="legend-group"
            x={x}
            y={y + startedAt * LEGEND_ROW + 9}
            fontSize={9}
            fontWeight={600}
            fill={MUTED}
            fontFamily="system-ui, sans-serif"
          >
            {group.title}
          </text>
        );
        row += 1;
        return (
          <g key={group.title}>
            {title}
            {drawn}
          </g>
        );
      })}
    </g>
  );
}

/* ── Text measurement and wrapping ──────────────────────────────────────────── */

const CHAR_WIDTH = 6.6;
const BOX_PADDING = 22;
const LINE_HEIGHT = 15;
const BOX_VERTICAL_PADDING = 14;
const MAX_LINES = 3;

function boxWidth(labels: string[], min: number, max: number): number {
  const longest = labels
    .flatMap((label) => label.split(/\r?\n/))
    .reduce((widest, line) => Math.max(widest, line.length), 0);
  return Math.min(Math.max(longest * CHAR_WIDTH + BOX_PADDING, min), max);
}

/**
 * Break a label into lines that fit, by hand.
 *
 * HTML wrapped text for free; native SVG does not, and this is what a portable
 * diagram costs. Words stay whole where they fit, a word longer than the line is
 * broken rather than allowed to overflow, and a label too long for its lines ends
 * in an ellipsis — the full text is on the element's `title`, so nothing is lost,
 * only deferred to a hover.
 */
export function wrapLabel(label: string, width: number): string[] {
  const perLine = Math.max(Math.floor((width - BOX_PADDING) / CHAR_WIDTH), 4);
  const lines: string[] = [];
  // An explicit newline is a break the producer asked for — a name and the thing
  // that qualifies it. Reflowing the two into one paragraph loses what they meant.
  const paragraphs = label.split(/\r?\n/);
  if (paragraphs.length > 1) {
    return paragraphs
      .flatMap((paragraph) => wrapLabel(paragraph, width))
      .slice(0, MAX_LINES);
  }
  let current = "";
  for (const word of label.split(/\s+/)) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length <= perLine) {
      current = candidate;
      continue;
    }
    if (current !== "") lines.push(current);
    current = word;
    while (current.length > perLine && lines.length < MAX_LINES) {
      lines.push(current.slice(0, perLine));
      current = current.slice(perLine);
    }
  }
  if (current !== "") lines.push(current);
  if (lines.length === 0) return [""];
  if (lines.length <= MAX_LINES) return lines;
  const kept = lines.slice(0, MAX_LINES);
  kept[MAX_LINES - 1] = `${kept[MAX_LINES - 1].slice(0, Math.max(perLine - 1, 1))}…`;
  return kept;
}

function boxHeight(lines: number, changeLines: number): number {
  return lines * LINE_HEIGHT + changeLines * LINE_HEIGHT + BOX_VERTICAL_PADDING;
}

/** One change, written the way a reader needs to see it. */
function changeText(change: ReturnType<typeof fieldChanges>[number]): string {
  return `${change.field}: ${change.from === undefined ? "" : `${change.from} → `}${change.to}`;
}

/**
 * Everything about a box in one line, for the hover: the escape hatch for whatever
 * wrapping had to cut, and the only channel that never runs out of room.
 */
function elementSummary(element: StructuredElement, role: ChangeRole): string {
  const parts = [displayLabel(element)];
  if (role !== "unchanged") parts.push(`(${ROLE_LABEL[role]})`);
  if (element.ref !== undefined) parts.push(`[${element.ref}]`);
  for (const change of fieldChanges(element)) parts.push(changeText(change));
  return parts.join(" ");
}

/* ── A box ──────────────────────────────────────────────────────────────────── */

function Box({
  x,
  y,
  width,
  height,
  role,
  label,
  tint,
  changes,
  title,
  anchor = "start",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  role: ChangeRole;
  label: string;
  tint?: Tint;
  changes: ReturnType<typeof fieldChanges>;
  title: string;
  anchor?: "start" | "middle";
}) {
  const role_paint = ROLE_PAINT[role];
  // Type picks the fill; role keeps the outline, and thickens it when something is
  // actually changing so the approval signal survives the colour.
  const paint = {
    fill: tint?.fill ?? role_paint.fill,
    stroke: role === "unchanged" ? (tint?.stroke ?? role_paint.stroke) : role_paint.stroke,
    text: role_paint.text === MUTED ? MUTED : INK,
  };
  const outline = role === "added" || role === "changed" ? 2 : 1.2;
  const lines = wrapLabel(label, width);
  const totalLines = lines.length + changes.length;
  const firstBaseline = y + height / 2 - ((totalLines - 1) * LINE_HEIGHT) / 2 + 4;
  const textX = anchor === "middle" ? x + width / 2 : x + 8;

  return (
    <g data-element-role={role}>
      <title>{title}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={5}
        fill={paint.fill}
        stroke={paint.stroke}
        strokeWidth={outline}
        strokeDasharray={role === "context" ? "4 3" : undefined}
      />
      <text x={textX} textAnchor={anchor} fontSize={11} fill={paint.text} fontFamily="system-ui, sans-serif">
        {lines.map((line, index) => (
          <tspan key={index} x={textX} y={firstBaseline + index * LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
        {changes.map((change, index) => (
          <tspan
            key={`change-${index}`}
            data-testid="field-changes"
            x={textX}
            y={firstBaseline + (lines.length + index) * LINE_HEIGHT}
            fontSize={9}
            fontWeight={600}
          >
            {changeText(change)}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** Arrow heads, one per role, since a marker cannot inherit a stroke colour. */
/** A marker id for a colour, since a hex is not a valid id on its own. */
export function markerId(prefix: string, paint: string): string {
  return `${prefix}-${paint.replace("#", "")}`;
}

/**
 * One arrowhead per colour actually drawn.
 *
 * Keyed by role, a type-coloured relationship got a role-coloured tip — a blue line
 * ending in a grey arrow. The colours in play are known before anything is drawn,
 * so they key themselves.
 */
function ArrowMarkers({ prefix, paints }: { prefix: string; paints: string[] }) {
  return (
    <defs>
      {paints.map((paint) => (
        <marker
          key={paint}
          id={markerId(prefix, paint)}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={paint} />
        </marker>
      ))}
    </defs>
  );
}

/* ── Graph ──────────────────────────────────────────────────────────────────── */

/** How far the reader has moved a box from where the layout put it. */
export type Nudge = { dx: number; dy: number };

/**
 * Where an edge should touch a box: from centre to centre, stopping at the border
 * it crosses. A fixed "right edge to left edge" is only correct when the target
 * sits immediately to the right, and cuts across unrelated boxes when it does not.
 */
function anchorPoint(
  from: { cx: number; cy: number; w: number; h: number },
  to: { cx: number; cy: number },
): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (dx === 0 && dy === 0) return { x: from.cx, y: from.cy };
  const scale = Math.min(
    dx === 0 ? Infinity : from.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : from.h / 2 / Math.abs(dy),
  );
  return { x: from.cx + dx * scale, y: from.cy + dy * scale };
}

type Box = { x: number; y: number; cx: number; cy: number; w: number; h: number };

/**
 * A polyline with its corners cut.
 *
 * A layout route is a sequence of straight segments, and drawn as such it turns
 * through hard angles that read as kinks rather than as a path going somewhere. Each
 * corner is replaced by a short quadratic through it, with the radius clamped to the
 * shorter of the two segments meeting there so a tight turn bends rather than
 * overshoots into the segment beyond it.
 */
function roundedPath(points: { x: number; y: number }[], radius: number): string {
  if (points.length < 3) {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  }

  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];

    const toPrevious = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const toNext = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (toPrevious === 0 || toNext === 0) continue;

    // A point that does not turn is not a corner. The layout engine emits collinear
    // waypoints even on a straight run, and rounding those put curve commands into a
    // line that was already straight.
    const turn =
      ((corner.x - previous.x) * (next.y - corner.y) - (corner.y - previous.y) * (next.x - corner.x)) /
      (toPrevious * toNext);
    if (Math.abs(turn) < 0.02) continue;

    const cut = Math.min(radius, toPrevious / 2, toNext / 2);
    const entry = {
      x: corner.x - ((corner.x - previous.x) / toPrevious) * cut,
      y: corner.y - ((corner.y - previous.y) / toPrevious) * cut,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) / toNext) * cut,
      y: corner.y + ((next.y - corner.y) / toNext) * cut,
    };
    parts.push(`L ${entry.x} ${entry.y}`, `Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}

/**
 * The shape a relationship is drawn as, and where its label goes.
 *
 * Every relationship gets its own `path`, for three reasons the straight `line` it
 * replaced could not meet. A relationship from something to itself has no direction
 * to draw along, and came out as a line of zero length — declared in the document,
 * invisible in the picture. Two relationships between the same pair were drawn on
 * exactly the same pixels, so a diagram showed one where the document had two. And
 * the layout engine works out routes that go around the boxes in between, which a
 * straight line between centres throws away and draws over.
 */
function edgePath(
  from: Box,
  to: Box,
  route: { x: number; y: number }[] | undefined,
  /** Which of the relationships between this same pair, in declaration order. */
  rank: number,
): { d: string; labelAt: { x: number; y: number }; span: number } {
  if (from === to) {
    // A loop, drawn by hand: out of the top, around, and back into the right side.
    // Nested by rank so several loops on one element stay countable.
    const reach = 26 + rank * 12;
    const startX = from.cx - from.w / 4;
    const endX = from.cx + from.w / 4;
    const top = from.y;
    return {
      d: `M ${startX} ${top} C ${startX} ${top - reach}, ${endX} ${top - reach}, ${endX} ${top}`,
      labelAt: { x: from.cx, y: top - reach * 0.75 },
      span: reach * 2,
    };
  }

  const start = anchorPoint(from, to);
  const finish = anchorPoint(to, from);
  const span = Math.hypot(finish.x - start.x, finish.y - start.y);

  // Middle points from the layout engine, if it routed this one. The ends are
  // recomputed against the boxes so the arrow still lands on a border.
  const waypoints = (route ?? []).slice(1, -1);
  if (waypoints.length > 0 && rank === 0) {
    const middle = waypoints[Math.floor((waypoints.length - 1) / 2)];
    return { d: roundedPath([start, ...waypoints, finish], 12), labelAt: middle, span };
  }

  // No route, or one of several between the same pair: bow the line out by a fixed
  // amount per rank, alternating sides so they fan rather than stack.
  const bow = rank === 0 ? 0 : (Math.ceil(rank / 2) * 22 * (rank % 2 === 1 ? 1 : -1));
  const midX = (start.x + finish.x) / 2;
  const midY = (start.y + finish.y) / 2;
  if (bow === 0) {
    return { d: `M ${start.x} ${start.y} L ${finish.x} ${finish.y}`, labelAt: { x: midX, y: midY }, span };
  }
  const nx = span === 0 ? 0 : -(finish.y - start.y) / span;
  const ny = span === 0 ? 0 : (finish.x - start.x) / span;
  const controlX = midX + nx * bow * 2;
  const controlY = midY + ny * bow * 2;
  return {
    d: `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${finish.x} ${finish.y}`,
    // On a quadratic the curve sits halfway between the midpoint and the control
    labelAt: { x: midX + nx * bow, y: midY + ny * bow },
    span,
  };
}

/** Every coordinate a generated path passes through. */
export function pathExtent(d: string): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numbers.length < 2) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    minX = Math.min(minX, numbers[index]);
    maxX = Math.max(maxX, numbers[index]);
    minY = Math.min(minY, numbers[index + 1]);
    maxY = Math.max(maxY, numbers[index + 1]);
  }
  return { minX, minY, maxX, maxY };
}

function edgeSummary(data: StructuredGraphData, edge: StructuredGraphData["edges"][number], role: ChangeRole): string {
  const name = (id: string) => {
    const node = data.nodes.find((candidate) => candidate.id === id);
    return node === undefined ? id : displayLabel(node);
  };
  const described = edge.label ?? edge.kind;
  return [
    `${name(edge.from)} → ${name(edge.to)}`,
    described === undefined ? "" : `(${described})`,
    role === "unchanged" ? "" : `[${ROLE_LABEL[role]}]`,
    fieldChanges(edge).map(changeText).join(", "),
  ]
    .filter((part) => part !== "")
    .join(" ");
}

function GraphView({
  data,
  isProposal,
  nudges,
  setNudges,
  hidden,
  setHidden,
}: {
  data: StructuredGraphData;
  isProposal: boolean;
  /**
   * Positions the reader has adjusted, as offsets from the computed layout. Held as
   * offsets rather than absolute points so a nudged box still follows if the document
   * changes underneath it, and held by the parent rather than here because the small
   * view and the enlarged one are two instances of this component: adjusting a
   * diagram at full size and finding the change gone on closing the modal is the kind
   * of loss that makes the feature not worth using.
   */
  nudges: ReadonlyMap<string, Nudge>;
  setNudges: (nudges: ReadonlyMap<string, Nudge>) => void;
  /**
   * Types the reader has switched off, qualified by what they are a type *of*.
   *
   * Elements and relationships have separate vocabularies that may well share a
   * word — "power" is a plausible kind of block and a plausible kind of connection.
   * Held in one namespace, hiding one hid the other.
   */
  hidden: ReadonlySet<string>;
  setHidden: (hidden: ReadonlySet<string>) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<string | undefined>(undefined);
  const [panning, setPanning] = useState(false);
  /**
   * What the pointer is over, and where to say so.
   *
   * A relationship's own label is drawn on it only when there is room, and a long
   * diagram scrolls — so the two relationships hardest to identify are exactly the
   * ones whose label was dropped and the ones that run off the edge. The native
   * `<title>` needs a hit on a one-pixel line and appears wherever the browser likes;
   * this follows the pointer and is positioned in the viewport, so it is never
   * clipped by the box the diagram scrolls in.
   */
  const [hovered, setHovered] = useState<{ text: string; x: number; y: number } | undefined>(undefined);
  /**
   * Teardown for a gesture still in flight.
   *
   * A drag that outlives its component keeps listeners on a detached node and leaves
   * the pointer captured. It also made the test suite exit non-zero while every
   * assertion passed — the failure was an unhandled rejection, which a summary line
   * saying "63 passed" does not mention.
   */
  const endGesture = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => endGesture.current?.(), []);

  // Each box is sized to its own contents. Handing dagre a real size per node is
  // what stops one long label from widening every box in the diagram.
  const sizeOf = useCallback(
    (node: StructuredElement) => {
      const width = boxWidth([displayLabel(node)], 120, 260);
      return { width, height: boxHeight(wrapLabel(displayLabel(node), width).length, fieldChanges(node).length) };
    },
    [],
  );

  /**
   * What the reader has left showing.
   *
   * A relationship goes when its own type goes, and also when either end of it goes:
   * a line to nowhere is worse than no line. Everything shows until the reader hides
   * something, so the default is still the whole document.
   */
  const shown = useMemo(() => {
    const nodes = data.nodes.filter((node) => node.kind === undefined || !hidden.has(filterKey("element", node.kind)));
    const present = new Set(nodes.map((node) => node.id));
    const edges = data.edges.filter(
      (edge) =>
        (edge.kind === undefined || !hidden.has(filterKey("relationship", edge.kind))) &&
        present.has(edge.from) &&
        present.has(edge.to),
    );
    return { nodes, edges };
  }, [data, hidden]);

  const layout = useMemo(() => layoutGraph(shown, sizeOf), [shown, sizeOf]);
  const at = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout]);

  const boxFor = (id: string) => {
    const placed = at.get(id);
    if (placed === undefined) return undefined;
    const nudge = nudges.get(id);
    const x = placed.x + (nudge?.dx ?? 0);
    const y = placed.y + (nudge?.dy ?? 0);
    return { x, y, cx: x + placed.width / 2, cy: y + placed.height / 2, w: placed.width, h: placed.height };
  };

  /**
   * A colour table per vocabulary.
   *
   * Elements and relationships are independent vocabularies drawn on independent
   * channels — a fill and a stroke — so contending for the same palette slots only
   * exhausted it sooner. A real thirty-three element architecture declared fourteen
   * element types and thirty-four relationship types; sharing one table, four pairs
   * of unrelated element types came out the same colour.
   */
  const elementTints = useMemo(() => assignTints(kindsPresent(data.nodes)), [data.nodes]);
  const relationshipTints = useMemo(() => assignTints(kindsPresent(data.edges)), [data.edges]);

  // The key explains the two channels the picture uses, and only the parts of them
  // this document exercises: no types declared, no type key; not a proposal, no roles.
  const legend = useMemo((): LegendGroup[] => {
    const swatch = (of: FilterScope) => (kind: string) => {
      const tint = (of === "element" ? elementTints : relationshipTints).get(kind)!;
      return {
        label: kind,
        fill: tint.fill,
        stroke: tint.stroke,
        toggles: true,
        key: filterKey(of, kind),
        hidden: hidden.has(filterKey(of, kind)),
      };
    };
    // Past the palette, colours repeat. Saying so is the difference between a key
    // that is incomplete and a key that is wrong: a reader who trusts colour alone
    // would otherwise read two unrelated types as one.
    const heading = (noun: string, count: number) =>
      count > KIND_TINT_COUNT ? `${noun} (${count} types, colours repeat)` : noun;
    const elementKinds = kindsPresent(data.nodes);
    const relationshipKinds = kindsPresent(data.edges);
    const groups: LegendGroup[] = [
      { title: heading("elements", elementKinds.length), sample: "box", entries: elementKinds.map(swatch("element")) },
      {
        title: heading("relationships", relationshipKinds.length),
        sample: "line",
        entries: relationshipKinds.map(swatch("relationship")),
      },
    ];

    if (isProposal) {
      const used = new Set<ChangeRole>([
        ...shown.nodes.map((node) => elementRole(node, true)),
        ...shown.edges.map((edge) => relationshipRole(edge, true)),
      ]);
      groups.push({
        title: "changes",
        sample: "box",
        entries: ROLES.filter((role) => role !== "unchanged" && used.has(role)).map((role) => ({
          label: ROLE_LABEL[role],
          fill: PAPER,
          stroke: ROLE_PAINT[role].stroke,
          dashed: role === "context",
        })),
      });
    }
    return groups;
  }, [data, shown, isProposal, elementTints, relationshipTints, hidden]);

  /**
   * Which relationships share a pair of endpoints, and in what order.
   *
   * Rank decides how far a relationship bows away from the straight run between two
   * boxes. Without it two relationships between the same pair were drawn on exactly
   * the same pixels; a reader counting connections counted one where there were two.
   * Direction is part of the key, so A→B and B→A each start at rank zero and stay on
   * the straight run they are entitled to.
   */
  const rankOf = useMemo(() => {
    const rank = new Map<(typeof data.edges)[number], number>();
    const seen = new Map<string, number>();
    for (const edge of shown.edges) {
      const pair = `${edge.from}\u0000${edge.to}`;
      const next = seen.get(pair) ?? 0;
      rank.set(edge, next);
      seen.set(pair, next + 1);
    }
    return rank;
  }, [shown]);

  /** Layout routes, matched back to the relationships they were computed for. */
  const routeOf = useMemo(() => {
    const byIndex = new Map(layout.edges.map((placed) => [placed.index, placed.points]));
    const routes = new Map<(typeof data.edges)[number], { x: number; y: number }[]>();
    shown.edges.forEach((edge, index) => {
      const points = byIndex.get(index);
      if (points !== undefined) routes.set(edge, points);
    });
    return routes;
  }, [layout, shown]);

  /**
   * Where every relationship goes, worked out before the canvas is sized.
   *
   * The extent used to come from the boxes alone, and relationships do not stay
   * inside them: the layout engine routes a long one around what it spans, which can
   * carry it above the topmost box, and a loop is drawn deliberately above the box it
   * belongs to. Both fell outside the viewBox and were simply cut off at the top edge.
   */
  const shapes = shown.edges.map((edge) => {
    const from = boxFor(edge.from);
    const to = boxFor(edge.to);
    if (from === undefined || to === undefined) return undefined;
    const moved = nudges.has(edge.from) || nudges.has(edge.to);
    return edgePath(from, edge.from === edge.to ? from : to, moved ? undefined : routeOf.get(edge), rankOf.get(edge) ?? 0);
  });

  // A nudged box can leave the computed extent in any direction, so the canvas
  // follows it in any direction. Bounded below at zero only, the first drag upwards
  // or leftwards clipped the box against the edge instead of making room for it.
  const drawn = layout.nodes.map((node) => boxFor(node.id)!);
  const routes = shapes.flatMap((shape) => {
    const extent = shape === undefined ? undefined : pathExtent(shape.d);
    return extent === undefined ? [] : [extent];
  });
  const left = Math.min(0, ...drawn.map((box) => box.x - 12), ...routes.map((route) => route.minX - 12));
  const top = Math.min(0, ...drawn.map((box) => box.y - 12), ...routes.map((route) => route.minY - 14));
  const right = Math.max(layout.width, ...drawn.map((box) => box.x + box.w + 12), ...routes.map((route) => route.maxX + 12));
  const bottom = Math.max(layout.height, ...drawn.map((box) => box.y + box.h + 12), ...routes.map((route) => route.maxY + 12));
  const diagramWidth = right - left;
  const diagramHeight = bottom - top;

  // Worked out once: the lines need it, and so do the arrowheads.
  const edgePaint = (edge: (typeof data.edges)[number]) => {
    const role = relationshipRole(edge, isProposal);
    // Same rule as the boxes: type carries the colour, role takes the line back the
    // moment it has something to say about it.
    if (role !== "unchanged") return RELATIONSHIP_PAINT[role];
    return (edge.kind === undefined ? undefined : relationshipTints.get(edge.kind)?.stroke) ?? RELATIONSHIP_PAINT[role];
  };
  const arrowPaints = [...new Set(shown.edges.map(edgePaint))];

  const legendTop = bottom + 4;
  const width = Math.max(diagramWidth, legendMinimumWidth(legend));
  const height = diagramHeight + legendHeight(legend, width);

  /**
   * Drag to adjust.
   *
   * No automatic layout satisfies every real model, so the reader can move a box
   * before approving what it shows. Deltas are measured in client space and divided
   * by the on-screen scale, so dragging tracks the pointer whether the diagram is
   * shown at natural size or enlarged.
   *
   * These positions are presentation only: they are not part of the document and
   * are not sent back. Re-opening the result shows the computed layout again.
   */
  /**
   * Drag the ground to pan.
   *
   * A wide diagram lives in a scrolling box, and reaching for a scrollbar to look at
   * the right-hand half of a picture you are in the middle of rearranging breaks the
   * gesture you were already making. Panning moves the box rather than the drawing,
   * so it composes with a node drag instead of competing with it, and it leaves the
   * exported figure untouched.
   */
  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    // A press that landed on something interactive is that thing's to handle. Panning
    // calls preventDefault and captures the pointer, which suppresses the `click`
    // that would otherwise follow — so without this the key was unclickable and
    // filtering did nothing at all in the browser, while tests that dispatched a
    // synthetic click straight at the entry went on passing.
    const landedOn = event.target as Element;
    if (landedOn.closest('[data-draggable="node"]') !== null) return;
    if (landedOn.closest("[data-legend-entry]") !== null) return;

    let scroller: HTMLElement | null = svgRef.current?.parentElement ?? null;
    while (
      scroller !== null &&
      scroller.scrollWidth <= scroller.clientWidth &&
      scroller.scrollHeight <= scroller.clientHeight
    ) {
      scroller = scroller.parentElement;
    }
    if (scroller === null) return;

    event.preventDefault();
    const originX = event.clientX;
    const originY = event.clientY;
    const fromLeft = scroller.scrollLeft;
    const fromTop = scroller.scrollTop;
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    setPanning(true);

    const move = (moved: PointerEvent) => {
      scroller.scrollLeft = fromLeft - (moved.clientX - originX);
      scroller.scrollTop = fromTop - (moved.clientY - originY);
    };
    const done = () => {
      endGesture.current = undefined;
      target.releasePointerCapture?.(event.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", done);
      target.removeEventListener("pointercancel", done);
      setPanning(false);
    };
    endGesture.current?.();
    endGesture.current = done;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", done);
    target.addEventListener("pointercancel", done);
  };

  const startDrag = (id: string) => (event: React.PointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const svg = svgRef.current;
    const scale = svg === null ? 1 : (svg.getBoundingClientRect().width || width) / width;
    const originX = event.clientX;
    const originY = event.clientY;
    const from = nudges.get(id) ?? { dx: 0, dy: 0 };
    const target = event.currentTarget;
    // Guarded: jsdom has no pointer capture at all, and a real browser can refuse it
    target.setPointerCapture?.(event.pointerId);
    setDragging(id);

    const move = (moved: PointerEvent) => {
      const next = new Map(nudges);
      next.set(id, {
        dx: from.dx + (moved.clientX - originX) / scale,
        dy: from.dy + (moved.clientY - originY) / scale,
      });
      setNudges(next);
    };
    const done = () => {
      endGesture.current = undefined;
      target.releasePointerCapture?.(event.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", done);
      target.removeEventListener("pointercancel", done);
      setDragging(undefined);
    };
    endGesture.current?.();
    endGesture.current = done;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", done);
    target.addEventListener("pointercancel", done);
  };

  return (
    <>
      {nudges.size > 0 && (
        <button
          type="button"
          className="mb-1 text-xs underline text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          onClick={() => setNudges(new Map())}
        >
          reset layout
        </button>
      )}
      {hovered !== undefined && (
        <div
          data-testid="relationship-tooltip"
          role="tooltip"
          // Fixed to the viewport, so a diagram scrolling inside a narrow column
          // cannot clip the one thing explaining what is off its edge.
          style={{ position: "fixed", left: hovered.x + 14, top: hovered.y + 14, zIndex: 120 }}
          className="pointer-events-none max-w-sm rounded bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {hovered.text}
        </div>
      )}
      <svg
        ref={svgRef}
        role="img"
        aria-label={
          shown.nodes.length === data.nodes.length
            ? `Graph of ${data.nodes.length} elements and ${data.edges.length} relationships`
            : `Graph of ${data.nodes.length} elements and ${data.edges.length} relationships, ` +
              `filtered to ${shown.nodes.length} elements and ${shown.edges.length} relationships`
        }
        viewBox={`${left} ${top} ${width} ${height}`}
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={startPan}
        style={{ cursor: panning ? "grabbing" : "grab", touchAction: "none" }}
      >
        <rect x={left} y={top} width={width} height={height} fill={PAPER} />
        <ArrowMarkers prefix="se-arrow" paints={arrowPaints} />

        {shown.edges.map((edge, index) => {
          const from = boxFor(edge.from);
          const to = boxFor(edge.to);
          if (from === undefined || to === undefined) return null;
          const role = relationshipRole(edge, isProposal);
          const paint = edgePaint(edge);
          const changes = fieldChanges(edge);
          const described = edge.label ?? edge.kind;
          // A layout route stops matching once the reader has moved either end of it
          const shape = shapes[index]!;
          // A label wider than the run it sits on ends up printed under the box it
          // points at, which reads as a clipped word rather than a missing one. Past
          // that point the hover carries it.
          const roomFor = (text: string) => text.length * 5.2 + 8 <= shape.span;

          return (
            <g
              key={`edge-${index}`}
              data-relationship-role={role}
              data-relationship-shape={edge.from === edge.to ? "loop" : "open"}
              onPointerEnter={(event) =>
                setHovered({ text: edgeSummary(data, edge, role), x: event.clientX, y: event.clientY })
              }
              onPointerMove={(event) =>
                setHovered({ text: edgeSummary(data, edge, role), x: event.clientX, y: event.clientY })
              }
              onPointerLeave={() => setHovered(undefined)}
            >
              <title>{edgeSummary(data, edge, role)}</title>
              {/* A line is one or two pixels wide and nobody can reliably hover one */}
              <path
                data-edge="hit"
                d={shape.d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                pointerEvents="stroke"
              />
              <path
                data-edge="line"
                pointerEvents="none"
                d={shape.d}
                fill="none"
                stroke={paint}
                strokeWidth={role === "context" ? 1 : 1.6}
                strokeDasharray={role === "context" ? "4 3" : undefined}
                markerEnd={`url(#${markerId("se-arrow", paint)})`}
              />
              {described !== undefined && roomFor(described) && (
                <text
                  x={shape.labelAt.x}
                  y={shape.labelAt.y - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fill={paint}
                  fontFamily="system-ui, sans-serif"
                  stroke={PAPER}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {described}
                </text>
              )}
              {changes.length > 0 && roomFor(changes.map(changeText).join(", ")) && (
                <text
                  data-testid="relationship-change"
                  x={shape.labelAt.x}
                  y={shape.labelAt.y + 10}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={paint}
                  fontFamily="system-ui, sans-serif"
                  stroke={PAPER}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {changes.map(changeText).join(", ")}
                </text>
              )}
            </g>
          );
        })}

        {shown.nodes.map((node) => {
          const box = boxFor(node.id);
          if (box === undefined) return null;
          const role = elementRole(node, isProposal);
          return (
            <g
              key={node.id}
              data-draggable="node"
              onPointerDown={startDrag(node.id)}
              style={{ cursor: dragging === node.id ? "grabbing" : "grab" }}
            >
              <Box
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                role={role}
                label={displayLabel(node)}
                tint={node.kind === undefined ? undefined : elementTints.get(node.kind)}
                changes={fieldChanges(node)}
                title={elementSummary(node, role)}
              />
            </g>
          );
        })}

        {hidden.size > 0 && (
          <text
            data-testid="diagram-filter-note"
            x={left + 12}
            y={legendTop + legendHeight(legend, width) - 4}
            fontSize={9}
            fontWeight={600}
            fill="#92400e"
            fontFamily="system-ui, sans-serif"
          >
            {`Filtered view: ${shown.nodes.length} of ${data.nodes.length} elements and ${shown.edges.length} of ${data.edges.length} relationships shown.` +
              (isProposal ? " Hidden types are still part of the proposal." : "")}
          </text>
        )}
        <Legend
          groups={legend}
          x={left + 12}
          y={legendTop}
          width={width}
          onToggle={(key) => {
            const next = new Set(hidden);
            if (!next.delete(key)) next.add(key);
            setHidden(next);
          }}
        />
      </svg>
    </>
  );
}

/* ── Sequence ───────────────────────────────────────────────────────────────── */

const MESSAGE_GAP = 40;
const SELF_LOOP = 26;

/**
 * A sequence as a sequence: lifelines down, time down, messages across.
 *
 * An earlier version was a numbered list. It carried the same data and was
 * markedly harder to read than the diagram exported from it — which is an argument
 * against the whole design, since the point of holding the data is that the native
 * view should be the good one and the export the convenience.
 */
function SequenceView({ data, isProposal }: { data: StructuredSequenceData; isProposal: boolean }) {
  const columnOf = useMemo(
    () => new Map(data.participants.map((participant, index) => [participant.id, index])),
    [data.participants],
  );
  const lifelineX = useMemo(
    () =>
      Math.max(
        boxWidth(data.participants.map(displayLabel), 110, 220),
        boxWidth(
          data.messages.map((message) => message.label ?? ""),
          110,
          240,
        ) * 0.8,
      ),
    [data.participants, data.messages],
  );
  const boxW = lifelineX - 14;
  const headerHeight = useMemo(
    () =>
      data.participants.reduce(
        (tallest, participant) =>
          Math.max(tallest, boxHeight(wrapLabel(displayLabel(participant), boxW).length, fieldChanges(participant).length)),
        boxHeight(1, 0),
      ) + 8,
    [data.participants, boxW],
  );
  const x = (id: string) => (columnOf.get(id) ?? 0) * lifelineX + lifelineX / 2;
  const diagramWidth = Math.max(data.participants.length * lifelineX, 240);
  const diagramHeight = headerHeight + (data.messages.length + 1) * MESSAGE_GAP;

  // Participants are elements and carry a type like any other; a message does not,
  // because its label is what it is.
  const tints = useMemo(() => assignTints(kindsPresent(data.participants)), [data.participants]);
  const legend = useMemo((): LegendGroup[] => {
    const groups: LegendGroup[] = [
      {
        title: "participants",
        sample: "box",
        entries: kindsPresent(data.participants).map((kind) => {
          const tint = tints.get(kind)!;
          return { label: kind, fill: tint.fill, stroke: tint.stroke, key: filterKey("element", kind) };
        }),
      },
    ];
    if (isProposal) {
      const used = new Set<ChangeRole>([
        ...data.participants.map((participant) => elementRole(participant, true)),
        ...data.messages.map((message) => relationshipRole(message, true)),
      ]);
      groups.push({
        title: "changes",
        sample: "box",
        entries: ROLES.filter((role) => role !== "unchanged" && used.has(role)).map((role) => ({
          label: ROLE_LABEL[role],
          fill: PAPER,
          stroke: ROLE_PAINT[role].stroke,
          dashed: role === "context",
        })),
      });
    }
    return groups;
  }, [data, isProposal, tints]);

  const legendTop = diagramHeight + 4;
  const width = Math.max(diagramWidth, legendMinimumWidth(legend));
  const height = diagramHeight + legendHeight(legend, width);

  return (
    <svg
      role="img"
      aria-label={`Sequence of ${data.participants.length} participants and ${data.messages.length} messages`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={width} height={height} fill={PAPER} />
      <ArrowMarkers prefix="se-msg" paints={ROLES.map((role) => RELATIONSHIP_PAINT[role])} />

      {data.participants.map((participant) => (
        <line
          key={`life-${participant.id}`}
          x1={x(participant.id)}
          y1={headerHeight}
          x2={x(participant.id)}
          y2={diagramHeight - 6}
          stroke="#d4d4d8"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      ))}

      {data.participants.map((participant) => {
        const role = elementRole(participant, isProposal);
        return (
          <Box
            key={participant.id}
            x={x(participant.id) - boxW / 2}
            y={4}
            width={boxW}
            height={headerHeight - 8}
            role={role}
            label={displayLabel(participant)}
            tint={participant.kind === undefined ? undefined : tints.get(participant.kind)}
            changes={fieldChanges(participant)}
            title={elementSummary(participant, role)}
            anchor="middle"
          />
        );
      })}

      {data.messages.map((message, index) => {
        const role = relationshipRole(message, isProposal);
        const paint = RELATIONSHIP_PAINT[role];
        const y = headerHeight + (index + 1) * MESSAGE_GAP;
        const fromX = x(message.from);
        const toX = x(message.to);
        const isSelf = message.from === message.to;
        const changes = fieldChanges(message);
        const labelX = isSelf ? fromX + SELF_LOOP + 6 : (fromX + toX) / 2;

        return (
          <g
            key={index}
            data-relationship-role={role}
            data-message-index={index}
            data-message-from={message.from}
            data-message-to={message.to}
          >
            <title>
              {[
                `${index + 1}.`,
                message.label ?? "",
                role === "unchanged" ? "" : `[${ROLE_LABEL[role]}]`,
                ...changes.map(changeText),
              ]
                .filter((part) => part !== "")
                .join(" ")}
            </title>
            {isSelf ? (
              <path
                d={`M ${fromX} ${y} h ${SELF_LOOP} v ${MESSAGE_GAP / 2} h -${SELF_LOOP}`}
                fill="none"
                stroke={paint}
                strokeWidth={1.4}
                markerEnd={`url(#${markerId("se-msg", RELATIONSHIP_PAINT[role])})`}
              />
            ) : (
              <line x1={fromX} y1={y} x2={toX} y2={y} stroke={paint} strokeWidth={1.4} markerEnd={`url(#${markerId("se-msg", RELATIONSHIP_PAINT[role])})`} />
            )}
            <text
              x={labelX}
              y={y - 5}
              textAnchor={isSelf ? "start" : "middle"}
              fontSize={10}
              fill={INK}
              fontFamily="system-ui, sans-serif"
              stroke={PAPER}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {message.label}
            </text>
            {changes.length > 0 && (
              <text
                data-testid="relationship-change"
                x={labelX}
                y={y + 11}
                textAnchor={isSelf ? "start" : "middle"}
                fontSize={9}
                fontWeight={600}
                fill={paint}
                fontFamily="system-ui, sans-serif"
                stroke={PAPER}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {changes.map(changeText).join(", ")}
              </text>
            )}
            <text x={4} y={y + 3} fontSize={9} fill={MUTED} fontFamily="system-ui, sans-serif">
              {index + 1}
            </text>
          </g>
        );
      })}

      <Legend groups={legend} x={12} y={legendTop} width={width} />
    </svg>
  );
}

/* ── Table ──────────────────────────────────────────────────────────────────── */

function TableView({ data }: { data: StructuredTableData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {data.columns.map((column, index) => (
              <th key={index} className="border-b border-zinc-300 px-2 py-1 text-left font-medium dark:border-zinc-700">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-zinc-200 px-2 py-1 dark:border-zinc-800">
                  {cell === null ? <span className="opacity-40">—</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Enlarged view ──────────────────────────────────────────────────────────── */

/**
 * The diagram at its own size, out of the chat column.
 *
 * Its natural size, not the window's: enlarging exists to undo a narrow column,
 * not to magnify a four-box diagram. Escape and the backdrop both close it — an
 * overlay you cannot dismiss without hunting for a control is worse than none.
 */
function EnlargedView({
  label,
  open,
  onClose,
  children,
  actions,
  containerRef,
}: {
  label: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Export controls, so a diagram adjusted at full size can be taken away from here. */
  actions?: ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  /**
   * Rendered into the document body rather than where it sits in the tree.
   *
   * `position: fixed` and a z-index are only as absolute as the nearest ancestor
   * that made a stacking context, and this modal lives deep inside the transcript.
   * The composer and the toolbar are in other branches with contexts of their own, so
   * they painted over an overlay that was nominally above them — leaving controls
   * visible and clickable through a dialog that had claimed the screen.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label}, full size`}
      data-testid="structured-enlarged"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto bg-black/60 p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-auto max-w-[95vw] overflow-auto rounded-lg bg-white p-4 shadow-xl dark:bg-zinc-900"
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-500">{label}</span>
          <div className="flex items-center gap-3">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ✕
            </button>
          </div>
        </div>
        <div ref={containerRef} className="[&_svg]:!max-w-none">
          {children}
        </div>
      </div>
    </div>,
    globalThis.document.body,
  );
}

/* ── Textual equivalent ─────────────────────────────────────────────────────── */


/**
 * What the view says, in words.
 *
 * Not a convenience: a diagram states relationships through geometry, and geometry
 * is not data. This is the same information in a form that does not depend on
 * seeing it.
 */
function textualEquivalent(envelope: ValidatedStructuredExchange, isProposal: boolean): string {
  const described = describeStructure(envelope, isProposal);
  const lines: string[] = [];

  if (described.columns !== undefined && described.rows !== undefined) {
    lines.push(described.columns.join(" | "));
    for (const row of described.rows) {
      lines.push(row.map((cell) => (cell === null ? "" : String(cell))).join(" | "));
    }
  } else {
    // Named and counted, so a reader who cannot see the picture knows how much of it
    // there is — and so a thing nothing connects to is still in the account.
    lines.push(`${described.things.length} ${described.thingNoun}s, ${described.links.length} ${described.linkNoun}s`);
    lines.push("");

    for (const thing of described.things) {
      lines.push(
        [
          thing.label,
          thing.kind === undefined ? "" : ` [${thing.kind}]`,
          thing.role === "unchanged" ? "" : ` (${ROLE_LABEL[thing.role]})`,
          thing.changes.length === 0 ? "" : ` — ${thing.changes.map(changeText).join(", ")}`,
        ].join(""),
      );
    }

    if (described.links.length > 0) lines.push("");
    described.links.forEach((link, index) => {
      // Both, when both are declared: the type says what kind of connection it is and
      // the label says what this one is, and neither stands in for the other.
      const said = [link.kind, link.label].filter((part) => part !== undefined && part !== "");
      const via = said.length === 0 ? "→" : `—${said.join(": ")}→`;
      lines.push(
        [
          described.linkNoun === "message" ? `${index + 1}. ` : "",
          `${link.fromLabel} ${via} ${link.toLabel}`,
          link.isLoop ? " (to itself)" : "",
          link.role === "unchanged" ? "" : ` (${ROLE_LABEL[link.role]})`,
          link.changes.length === 0 ? "" : ` — ${link.changes.map(changeText).join(", ")}`,
        ].join(""),
      );
    });
  }

  if (described.removals.length > 0) {
    lines.push("");
    for (const removal of described.removals) lines.push(`removed ${removal.type}: ${removal.ref}`);
  }
  return lines.join("\n");
}

/* ── The presentation ───────────────────────────────────────────────────────── */

/** The control row's link styling, shared with the same controls inside the modal. */
const LINK_BUTTON = "text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200";

function StructuredExchangeBody({ item }: PresentationProps) {
  const envelope = validStructuredExchange(item.structured);
  const [enlarged, setEnlarged] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const enlargedRef = useRef<HTMLDivElement>(null);
  const [nudges, setNudges] = useState<ReadonlyMap<string, Nudge>>(new Map());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const mermaid = useMemo(() => (envelope ? toMermaid(envelope) : undefined), [envelope]);

  // Defensive: the registry only selects this entry for a validated envelope, so
  // reaching here without one would be a bug in selection rather than in data.
  if (envelope === undefined) return null;

  const isProposal = envelope.target !== undefined;
  const removals = envelope.removals ?? [];
  const view =
    envelope.kind === "graph" ? (
      <GraphView
        data={envelope.data as StructuredGraphData}
        isProposal={isProposal}
        nudges={nudges}
        setNudges={setNudges}
        hidden={hidden}
        setHidden={setHidden}
      />
    ) : envelope.kind === "sequence" ? (
      <SequenceView data={envelope.data as StructuredSequenceData} isProposal={isProposal} />
    ) : (
      <TableView data={envelope.data as StructuredTableData} />
    );

  // Named outside the handlers: a function declaration is hoisted, so the narrowing
  // that follows the guard above does not reach inside one.
  const fileName = `${envelope.kind}-${envelope.target ?? "diagram"}.svg`.replace(/[^\w.-]+/g, "-");

  /**
   * The diagram's markup, standing on its own — colours and ground included.
   *
   * Taken from whichever copy the reader is actually looking at. The enlarged view
   * is a second instance of the same component with its own adjusted positions, so
   * reading the small one while the modal is open would export a picture the reader
   * had just finished rearranging away from.
   */
  function serializeDiagram(): string | undefined {
    const container = enlargedRef.current ?? diagramRef.current;
    const svg = container?.querySelector("svg");
    return svg ? new XMLSerializer().serializeToString(svg) : undefined;
  }

  /**
   * Save the diagram as a file.
   *
   * The path that actually works for a document: Word does not accept an SVG
   * pasted from the clipboard — it wants a file, inserted as a picture. Offering
   * only "copy" would look like a feature and fail at the one place it was for.
   */
  function downloadDiagram() {
    const markup = serializeDiagram();
    if (markup === undefined) return;
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setCopied("SVG downloaded");
    window.setTimeout(() => setCopied(null), 2500);
  }

  /** For anywhere that does take SVG markup directly — an editor, a wiki, a repo. */
  async function copyDiagram() {
    const markup = serializeDiagram();
    if (markup === undefined) return;
    try {
      await navigator.clipboard.writeText(markup);
      setCopied("SVG markup copied");
    } catch {
      setCopied("could not copy");
    }
    window.setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="space-y-3 text-sm">
      {isProposal && (
        <p className="text-xs text-zinc-500">
          Proposed changes to <span className="font-mono">{envelope.target}</span>. Only what changes is shown; anything
          not mentioned is left as it is.
        </p>
      )}

      {/* Filtering is for reading, and this view is an approval gate: the reader has
          to be told, plainly and while they are looking, that the picture in front of
          them is no longer the whole document. The key inside the SVG carries the same
          news to anywhere the figure is exported to. */}
      {hidden.size > 0 && (
        <p
          data-testid="structured-filtered"
          className="flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span>
            Filtered view — {[...hidden].map((key) => key.replace(/^(element|relationship):/, "")).join(", ")} hidden.{" "}
            {isProposal ? "The full proposal still applies." : ""}
          </span>
          <button type="button" className="underline" onClick={() => setHidden(new Set())}>
            show everything
          </button>
        </p>
      )}

      {/* Scrolls rather than scaling: a wide diagram squeezed into the chat column
          arrives as a sliver, which is how a seventeen-node architecture rendered as
          an empty line. Enlarge gives the whole thing without the horizontal scrub. */}
      <div ref={diagramRef} className="overflow-x-auto">
        {view}
      </div>
      <EnlargedView
        label={`${envelope.kind} view`}
        open={enlarged}
        onClose={() => setEnlarged(false)}
        containerRef={enlargedRef}
        actions={
          envelope.kind !== "table" && (
            <>
              <button type="button" onClick={downloadDiagram} className={LINK_BUTTON}>
                ⤓ download SVG
              </button>
              <button type="button" onClick={copyDiagram} className={LINK_BUTTON}>
                copy markup
              </button>
              {copied !== null && <span className="text-xs text-zinc-500">{copied}</span>}
            </>
          )
        }
      >
        {view}
      </EnlargedView>

      {removals.length > 0 && (
        <ul className="space-y-1" data-testid="structured-removals">
          {removals.map((removal, index) => (
            <li
              key={index}
              data-relationship-role="removed"
              className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 line-through dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              {removal.type}: {removal.ref}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          className="text-zinc-500 underline"
          aria-label={`Show ${envelope.kind} view at full size`}
          onClick={() => setEnlarged(true)}
        >
          ⤢ enlarge
        </button>
        {envelope.kind !== "table" && (
          <>
            <button
              type="button"
              className="text-zinc-500 underline"
              title="Save as .svg — insert it as a picture in a document"
              onClick={downloadDiagram}
            >
              ⤓ download SVG
            </button>
            <button
              type="button"
              className="text-zinc-500 underline"
              title="Copy the SVG markup, for somewhere that takes it directly"
              onClick={() => void copyDiagram()}
            >
              copy markup
            </button>
          </>
        )}
        <button type="button" className="text-zinc-500 underline" onClick={() => setShowText((open) => !open)}>
          {showText ? "hide" : "show"} text equivalent
        </button>
        {mermaid !== undefined && (
          <button type="button" className="text-zinc-500 underline" onClick={() => setShowExport((open) => !open)}>
            {showExport ? "hide" : "show"} derived diagram syntax
          </button>
        )}
        <button type="button" className="text-zinc-500 underline" onClick={() => setShowRaw((open) => !open)}>
          {showRaw ? "hide" : "show"} original output
        </button>
        {copied !== null && (
          <span role="status" className="text-emerald-600 dark:text-emerald-400">
            {copied}
          </span>
        )}
      </div>

      {showText && (
        <pre data-testid="structured-text-equivalent" className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
          {textualEquivalent(envelope, isProposal)}
        </pre>
      )}
      {showExport && mermaid !== undefined && (
        <div>
          <p className="mb-1 text-[11px] text-zinc-500">
            Derived from the structured data above. It is an export, not the source.
          </p>
          <pre data-testid="structured-derived-export" className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
            {mermaid}
          </pre>
        </div>
      )}
      {showRaw && (
        <pre data-testid="structured-raw-output" className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
          {item.output}
        </pre>
      )}
    </div>
  );
}

export const structuredExchangePresentation = {
  id: "structured-exchange",
  /**
   * Only a validated envelope. `match` runs on every candidate, so it must not
   * throw on a malformed one — the registry treats a throwing matcher as a
   * decline, but a matcher that relies on that is a matcher that hides bugs.
   */
  match: (item: ToolItem) => validStructuredExchange(item.structured) !== undefined,
  stable: false,
  showsRawReveal: true,
  startsExpanded: true,
  Expanded: StructuredExchangeBody,
} as const;
