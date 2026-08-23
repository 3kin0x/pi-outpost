/**
 * The rendering decisions, run under Node.
 *
 * These functions were exported from a browser component and covered only by mounting
 * it. That was enough while the picture existed in one place. It is not enough now: a
 * figure produced for the agent runs this same code with no browser anywhere, so
 * "does it run outside a browser at all" has to be an assertion rather than a hope —
 * a `measureText` or a `document` reached for here would fail this file and nothing
 * else, because the jsdom suite would keep supplying one.
 *
 * What is pinned is arithmetic: given these labels, that width. If a constant moves,
 * every figure moves with it, and these numbers are the record of what the pictures
 * were computed from.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  assignTints,
  KIND_TINT_COUNT,
  kindsPresent,
  ROLE_PAINT,
} from "@pi-outpost/shared/structured-exchange/palette";
import {
  boxHeight,
  boxWidth,
  BOX_PADDING,
  CHAR_WIDTH,
  MAX_LINES,
  wrapLabel,
} from "@pi-outpost/shared/structured-exchange/text";
import { layoutGraph, layoutSequence } from "@pi-outpost/shared/structured-exchange/model";

describe("width is counted, never measured", () => {
  test("a box is as wide as its longest line says", () => {
    // The whole parity argument rests on this being arithmetic. 8 characters at 6.6
    // plus the padding, and no font, canvas or element consulted to find it out.
    assert.equal(boxWidth(["Batterie"], 0, 1000), 8 * CHAR_WIDTH + BOX_PADDING);
  });

  test("the floor holds it, and the ceiling caps it", () => {
    assert.equal(boxWidth(["x"], 120, 1000), 120);
    assert.equal(boxWidth(["a".repeat(400)], 0, 240), 240);
  });

  test("an embedded newline is measured as two lines, not one long one", () => {
    // The producer asked for the break; reflowing it into one paragraph would both
    // lose their meaning and size the box for a line nobody draws.
    assert.equal(boxWidth(["Pompe\nprincipale"], 0, 1000), boxWidth(["principale"], 0, 1000));
  });
});

describe("wrapping, which native SVG will not do", () => {
  test("words stay whole while they fit", () => {
    assert.deepEqual(wrapLabel("alpha beta", 10 * CHAR_WIDTH + BOX_PADDING, CHAR_WIDTH), ["alpha beta"]);
  });

  test("a word longer than the line is broken rather than allowed to overflow", () => {
    const lines = wrapLabel("abcdefghijklmnop", 6 * CHAR_WIDTH + BOX_PADDING, CHAR_WIDTH);
    assert.ok(lines.length > 1, `expected a break, got ${JSON.stringify(lines)}`);
    for (const line of lines) assert.ok(line.length <= 6, `"${line}" is wider than the box`);
  });

  test("a box sized for exactly n characters fits n, not n-1", () => {
    // The epsilon in wrapLabel is what makes this true: without it the division
    // computes n - 1e-15 and the floor wraps a line that fits.
    assert.deepEqual(wrapLabel("abcdef", 6 * CHAR_WIDTH + BOX_PADDING, CHAR_WIDTH), ["abcdef"]);
  });

  test("too much text ends in an ellipsis rather than running on", () => {
    const lines = wrapLabel("one two three four five six seven eight nine ten", 8 * CHAR_WIDTH + BOX_PADDING, CHAR_WIDTH);
    assert.equal(lines.length, MAX_LINES);
    assert.ok(lines[MAX_LINES - 1].endsWith("…"));
  });

  test("an empty label is one empty line, never no lines", () => {
    assert.deepEqual(wrapLabel("", 100, CHAR_WIDTH), [""]);
  });
});

describe("colour by kind, stable across sessions", () => {
  test("the same kind draws the same colour every time", () => {
    const first = assignTints(["power", "thermal"]);
    const second = assignTints(["thermal", "power"]);
    assert.deepEqual(first.get("power"), second.get("power"));
    assert.deepEqual(first.get("thermal"), second.get("thermal"));
  });

  test("kinds beyond the tint count still get a presentation", () => {
    const many = Array.from({ length: KIND_TINT_COUNT * 3 }, (_, i) => `kind-${i}`);
    const tints = assignTints(many);
    for (const kind of many) assert.ok(tints.get(kind) !== undefined, `${kind} got no tint`);
  });

  test("kinds are reported in the order they appear, once each", () => {
    assert.deepEqual(
      kindsPresent([{ kind: "power" }, { kind: "thermal" }, { kind: "power" }, {}, { kind: "" }]),
      ["power", "thermal"],
    );
  });

  test("every role has paint", () => {
    for (const role of ["added", "changed", "context", "unchanged"] as const) {
      assert.ok(ROLE_PAINT[role].fill.startsWith("#"), `${role} has no fill`);
    }
  });
});

/** Sizing composed from the shared text functions, the way the view composes it. */
const size = (node: { label?: string }) => {
  const labels = [node.label ?? ""];
  const width = boxWidth(labels, 90, 260);
  return { width, height: boxHeight(wrapLabel(labels[0], width).length, 0) };
};

describe("layout runs under Node", () => {
  test("dagre places every node and returns an extent to draw on", () => {
    // The one dependency that could have needed a browser. It does not, and this is
    // where that stops being an assumption.
    const layout = layoutGraph(
      {
        nodes: [{ id: "a", label: "Batterie" }, { id: "b", label: "Pompe" }],
        edges: [{ from: "a", to: "b", label: "400V" }],
      },
      size,
    );
    assert.equal(layout.nodes.length, 2);
    for (const node of layout.nodes) {
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.id} was not placed`);
      assert.ok(node.width > 0 && node.height > 0, `${node.id} has no size`);
    }
    assert.ok(layout.width > 0 && layout.height > 0, "the canvas has no extent");
  });

  test("the same graph lays out the same way twice", () => {
    const graph = {
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    };
    const first = layoutGraph(graph, size);
    const second = layoutGraph(graph, size);
    assert.deepEqual(
      first.nodes.map((n) => [n.id, n.x, n.y, n.width, n.height]),
      second.nodes.map((n) => [n.id, n.x, n.y, n.width, n.height]),
    );
  });
});

describe("a sequence is placed under Node too", () => {
  const data = {
    participants: [
      { id: "batt", label: "Batterie", container: "hv" },
      { id: "dash", label: "Tableau de bord" },
      { id: "ecu", label: "Calculateur", container: "hv" },
    ],
    messages: [
      { from: "batt", to: "ecu", label: "400V" },
      { from: "ecu", to: "dash", label: "\u00e9tat" },
    ],
    containers: [{ id: "hv", label: "Haute tension" }],
  };

  test("a container's members are made adjacent so one header can span them", () => {
    // Declared order is batt, dash, ecu — which no single header can span. The rule is
    // that the first member met brings the rest of its container with it, and a
    // participant belonging to nothing keeps its place.
    const layout = layoutSequence(data);
    assert.deepEqual(layout.columns.map((c) => c.id), ["batt", "ecu", "dash"]);
    assert.equal(layout.bands.length, 1);
    assert.deepEqual([layout.bands[0].from, layout.bands[0].to], [0, 1]);
  });

  test("lifelines stand where the columns put them", () => {
    const layout = layoutSequence(data);
    assert.equal(layout.xOf("batt"), layout.lifelineX / 2);
    assert.equal(layout.xOf("ecu"), layout.lifelineX * 1.5);
    assert.ok(layout.width > 0 && layout.height > 0);
  });

  test("no container declared means no band to reserve room for", () => {
    const flat = layoutSequence({ participants: data.participants, messages: data.messages });
    assert.equal(flat.bandHeight, 0);
    assert.equal(flat.bands.length, 0);
    assert.deepEqual(flat.columns.map((c) => c.id), ["batt", "dash", "ecu"]);
  });

  test("the same sequence is placed the same way twice", () => {
    const first = layoutSequence(data);
    const second = layoutSequence(data);
    assert.deepEqual(
      [first.width, first.height, first.lifelineX, first.headerHeight],
      [second.width, second.height, second.lifelineX, second.headerHeight],
    );
  });
});
