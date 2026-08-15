import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  StructuredElement,
  StructuredGraphData,
  StructuredSequenceData,
  StructuredTableData,
  ValidatedStructuredExchange,
} from "@pi-outpost/shared/structured-exchange";
import {
  displayLabel,
  elementRole,
  fieldChanges,
  layerGraph,
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

/* ── Text measurement and wrapping ──────────────────────────────────────────── */

const CHAR_WIDTH = 6.6;
const BOX_PADDING = 22;
const LINE_HEIGHT = 15;
const BOX_VERTICAL_PADDING = 14;
const MAX_LINES = 3;

function boxWidth(labels: string[], min: number, max: number): number {
  const longest = labels.reduce((widest, label) => Math.max(widest, label.length), 0);
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
  changes: ReturnType<typeof fieldChanges>;
  title: string;
  anchor?: "start" | "middle";
}) {
  const paint = ROLE_PAINT[role];
  const lines = wrapLabel(label, width);
  const totalLines = lines.length + changes.length;
  const firstBaseline = y + height / 2 - ((totalLines - 1) * LINE_HEIGHT) / 2 + 4;
  const textX = anchor === "middle" ? x + width / 2 : x + 8;

  return (
    <g data-element-role={role}>
      <title>{title}</title>
      <rect x={x} y={y} width={width} height={height} rx={5} fill={paint.fill} stroke={paint.stroke} strokeWidth={1.2} />
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
function ArrowMarkers({ prefix }: { prefix: string }) {
  return (
    <defs>
      {ROLES.map((role) => (
        <marker
          key={role}
          id={`${prefix}-${role}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={RELATIONSHIP_PAINT[role]} />
        </marker>
      ))}
    </defs>
  );
}

/* ── Graph ──────────────────────────────────────────────────────────────────── */

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

function GraphView({ data, isProposal }: { data: StructuredGraphData; isProposal: boolean }) {
  const placed = useMemo(() => layerGraph(data), [data]);
  const at = useMemo(() => new Map(placed.map((entry) => [entry.id, entry])), [placed]);
  const nodeWidth = useMemo(() => boxWidth(data.nodes.map(displayLabel), 120, 240), [data.nodes]);
  const nodeHeight = useMemo(
    () =>
      data.nodes.reduce(
        (tallest, node) =>
          Math.max(tallest, boxHeight(wrapLabel(displayLabel(node), nodeWidth).length, fieldChanges(node).length)),
        boxHeight(1, 0),
      ),
    [data.nodes, nodeWidth],
  );
  const columnWidth = nodeWidth + 60;
  const rowHeight = nodeHeight + 26;
  const width = (Math.max(...placed.map((entry) => entry.depth), 0) + 1) * columnWidth;
  const height = (Math.max(...placed.map((entry) => entry.order), 0) + 1) * rowHeight + 8;

  const boxFor = (id: string) => {
    const position = at.get(id);
    if (position === undefined) return undefined;
    const x = position.depth * columnWidth + 10;
    const y = position.order * rowHeight + 8;
    return { x, y, cx: x + nodeWidth / 2, cy: y + nodeHeight / 2, w: nodeWidth, h: nodeHeight };
  };

  return (
    <svg
      role="img"
      aria-label={`Graph of ${data.nodes.length} elements and ${data.edges.length} relationships`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ maxWidth: "100%", height: "auto" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={width} height={height} fill={PAPER} />
      <ArrowMarkers prefix="se-arrow" />

      {data.edges.map((edge, index) => {
        const from = boxFor(edge.from);
        const to = boxFor(edge.to);
        if (from === undefined || to === undefined) return null;
        const role = relationshipRole(edge, isProposal);
        const paint = RELATIONSHIP_PAINT[role];
        const start = anchorPoint(from, to);
        const finish = anchorPoint(to, from);
        const changes = fieldChanges(edge);
        const described = edge.label ?? edge.kind;
        const span = Math.hypot(finish.x - start.x, finish.y - start.y);
        // A label wider than the gap it sits in ends up printed under the box it
        // points at, which reads as a clipped word rather than a missing one. Past
        // that point the hover carries it.
        const roomFor = (text: string) => text.length * 5.2 + 8 <= span;
        const alongEdge = 0.34 + (index % 3) * 0.16;
        const labelX = start.x + (finish.x - start.x) * alongEdge;
        const labelY = start.y + (finish.y - start.y) * alongEdge;

        return (
          <g key={`edge-${index}`} data-relationship-role={role}>
            <title>{edgeSummary(data, edge, role)}</title>
            <line
              x1={start.x}
              y1={start.y}
              x2={finish.x}
              y2={finish.y}
              stroke={paint}
              strokeWidth={role === "context" ? 1 : 1.6}
              strokeDasharray={role === "context" ? "4 3" : undefined}
              markerEnd={`url(#se-arrow-${role})`}
            />
            {described !== undefined && roomFor(described) && (
              <text
                x={labelX}
                y={labelY - 5}
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
                x={labelX}
                y={labelY + 10}
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

      {data.nodes.map((node) => {
        const box = boxFor(node.id);
        if (box === undefined) return null;
        const role = elementRole(node, isProposal);
        return (
          <Box
            key={node.id}
            x={box.x}
            y={box.y}
            width={nodeWidth}
            height={nodeHeight}
            role={role}
            label={displayLabel(node)}
            changes={fieldChanges(node)}
            title={elementSummary(node, role)}
          />
        );
      })}
    </svg>
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
  const width = Math.max(data.participants.length * lifelineX, 240);
  const height = headerHeight + (data.messages.length + 1) * MESSAGE_GAP;

  return (
    <svg
      role="img"
      aria-label={`Sequence of ${data.participants.length} participants and ${data.messages.length} messages`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ maxWidth: "100%", height: "auto" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={width} height={height} fill={PAPER} />
      <ArrowMarkers prefix="se-msg" />

      {data.participants.map((participant) => (
        <line
          key={`life-${participant.id}`}
          x1={x(participant.id)}
          y1={headerHeight}
          x2={x(participant.id)}
          y2={height - 6}
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
                markerEnd={`url(#se-msg-${role})`}
              />
            ) : (
              <line x1={fromX} y1={y} x2={toX} y2={y} stroke={paint} strokeWidth={1.4} markerEnd={`url(#se-msg-${role})`} />
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
}: {
  label: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label}, full size`}
      data-testid="structured-enlarged"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/50 p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-auto max-w-[95vw] overflow-auto rounded-lg bg-white p-4 shadow-xl dark:bg-zinc-900"
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-xs text-zinc-500">{label}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
        <div className="[&_svg]:!max-w-none">{children}</div>
      </div>
    </div>
  );
}

/* ── Textual equivalent ─────────────────────────────────────────────────────── */

function describeChanges(subject: Parameters<typeof fieldChanges>[0]): string {
  const changes = fieldChanges(subject);
  return changes.length === 0 ? "" : changes.map((change) => ` [${changeText(change)}]`).join("");
}

/**
 * What the view says, in words.
 *
 * Not a convenience: a diagram states relationships through geometry, and geometry
 * is not data. This is the same information in a form that does not depend on
 * seeing it.
 */
function textualEquivalent(envelope: ValidatedStructuredExchange, isProposal: boolean): string {
  const lines: string[] = [];
  if (envelope.kind === "graph") {
    const data = envelope.data as StructuredGraphData;
    const label = new Map(data.nodes.map((node) => [node.id, displayLabel(node)]));
    for (const node of data.nodes) {
      const role = elementRole(node, isProposal);
      lines.push(`${displayLabel(node)}${role === "unchanged" ? "" : ` (${ROLE_LABEL[role]})`}${describeChanges(node)}`);
    }
    for (const edge of data.edges) {
      const role = relationshipRole(edge, isProposal);
      const via = edge.kind ?? edge.label ?? "relates to";
      lines.push(
        `${label.get(edge.from) ?? edge.from} —${via}→ ${label.get(edge.to) ?? edge.to}` +
          (role === "unchanged" ? "" : ` (${ROLE_LABEL[role]})`) +
          describeChanges(edge),
      );
    }
  } else if (envelope.kind === "sequence") {
    const data = envelope.data as StructuredSequenceData;
    const label = new Map(data.participants.map((p) => [p.id, displayLabel(p)]));
    data.messages.forEach((message, index) => {
      lines.push(
        `${index + 1}. ${label.get(message.from) ?? message.from} → ${label.get(message.to) ?? message.to}: ${message.label ?? ""}` +
          describeChanges(message),
      );
    });
  } else {
    const data = envelope.data as StructuredTableData;
    lines.push(data.columns.join(" | "));
    for (const row of data.rows) lines.push(row.map((cell) => (cell === null ? "" : String(cell))).join(" | "));
  }
  for (const removal of envelope.removals ?? []) lines.push(`removed ${removal.type}: ${removal.ref}`);
  return lines.join("\n");
}

/* ── The presentation ───────────────────────────────────────────────────────── */

function StructuredExchangeBody({ item }: PresentationProps) {
  const envelope = validStructuredExchange(item.structured);
  const [enlarged, setEnlarged] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const mermaid = useMemo(() => (envelope ? toMermaid(envelope) : undefined), [envelope]);

  // Defensive: the registry only selects this entry for a validated envelope, so
  // reaching here without one would be a bug in selection rather than in data.
  if (envelope === undefined) return null;

  const isProposal = envelope.target !== undefined;
  const removals = envelope.removals ?? [];
  const view =
    envelope.kind === "graph" ? (
      <GraphView data={envelope.data as StructuredGraphData} isProposal={isProposal} />
    ) : envelope.kind === "sequence" ? (
      <SequenceView data={envelope.data as StructuredSequenceData} isProposal={isProposal} />
    ) : (
      <TableView data={envelope.data as StructuredTableData} />
    );

  /**
   * The diagram as a file, for wherever it is going next.
   *
   * The SVG carries its own colours and its own ground, so what lands in a
   * document looks like what was on screen — which is the whole reason the boxes
   * are `rect` and `text` rather than HTML in a `foreignObject`.
   */
  async function copyDiagram() {
    const svg = diagramRef.current?.querySelector("svg");
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(new XMLSerializer().serializeToString(svg));
      setCopied("SVG copied");
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

      <div ref={diagramRef}>{view}</div>
      <EnlargedView label={`${envelope.kind} view`} open={enlarged} onClose={() => setEnlarged(false)}>
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
          <button type="button" className="text-zinc-500 underline" onClick={() => void copyDiagram()}>
            copy diagram
          </button>
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
