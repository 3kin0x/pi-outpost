import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ChatItem } from "@pi-outpost/shared";
import { STRUCTURED_EXCHANGE_SCHEMA_V1 as S } from "@pi-outpost/shared/structured-exchange";
import { selectPresentation, PRESENTATIONS } from "./registry";
import { structuredExchangePresentation } from "./StructuredExchangeView";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

const tool = (over: Partial<ToolItem> = {}): ToolItem => ({
  kind: "tool",
  toolCallId: "t1",
  toolName: "some_tool",
  args: {},
  output: "the original output",
  ...over,
});

const withStructured = (document: unknown, over: Partial<ToolItem> = {}) =>
  tool({ structured: JSON.stringify(document), ...over });

const proposal = {
  schema: S,
  kind: "graph",
  target: "artifact-1",
  removals: [{ type: "relationship", ref: "REL-9" }],
  data: {
    nodes: [
      { id: "keep", ref: "EL-1" },
      { id: "rename", ref: "EL-2", label: "Ledger", set: { label: "General Ledger" } },
      { id: "fresh", label: "Brand new" },
    ],
    edges: [{ from: "fresh", to: "keep", kind: "composition" }],
  },
};

const newArtifact = {
  schema: S,
  kind: "graph",
  data: { nodes: [{ id: "a", label: "A" }], edges: [] },
};


/**
 * Toggle a key entry the way a pointer does: press, release, then click.
 *
 * A synthetic `click` on its own is not how anyone reaches this control, and driving
 * it that way hid a real break for a whole session — the pan gesture on the canvas
 * called preventDefault on pointerdown, which suppresses the click that follows, so
 * the key was inert in the browser while every test went on passing.
 */
const toggleLegend = (key: string) => {
  const entry = document.querySelector(`[data-legend-entry="${key}"]`)!;
  const target = entry.querySelector("text") ?? entry;
  const at = { clientX: 5, clientY: 5, button: 0, bubbles: true, cancelable: true };
  target.dispatchEvent(Object.assign(new MouseEvent("pointerdown", at), { pointerId: 1 }));
  target.dispatchEvent(Object.assign(new MouseEvent("pointerup", at), { pointerId: 1 }));
  fireEvent.click(target);
};

const renderBody = (item: ToolItem) =>
  render(<structuredExchangePresentation.Expanded item={item} dispatch={vi.fn()} />);

describe("registry placement", () => {
  it("selects the structured presentation for a validated envelope", () => {
    expect(selectPresentation(withStructured(newArtifact)).id).toBe("structured-exchange");
  });

  it("ignores an envelope that does not validate, falling back as usual", () => {
    const broken = withStructured({ schema: S, kind: "graph", data: { nodes: [], edges: [] } });
    expect(selectPresentation(broken).id).not.toBe("structured-exchange");
  });

  it("outranks a presentation that infers its shape from output", () => {
    // A result that also looks like a hit list: declared data beats a guess.
    const both = withStructured(newArtifact, { output: "src/main.ts:12:const x = 1\nsrc/other.ts:3:hello" });
    expect(selectPresentation(both).id).toBe("structured-exchange");
  });

  it("does not outrank an extension's own rendering of its tool", () => {
    const extensionOwned = withStructured(newArtifact, { outputHtml: "<p>the extension's own view</p>" });
    const chosen = selectPresentation(extensionOwned);
    expect(chosen.extensionOwned).toBe(true);
    expect(chosen.id).not.toBe("structured-exchange");
  });

  it("sits below the extension entry and above every shape guess", () => {
    const ids = PRESENTATIONS.map((presentation) => presentation.id);
    expect(ids.indexOf("structured-exchange")).toBe(1);
    expect(ids.indexOf("structured-exchange")).toBeLessThan(ids.indexOf("code-search"));
    expect(ids.indexOf("structured-exchange")).toBeLessThan(ids.indexOf("pi-render"));
  });

  it("declines a result with no structured payload without throwing", () => {
    expect(() => structuredExchangePresentation.match(tool())).not.toThrow();
    expect(structuredExchangePresentation.match(tool())).toBe(false);
  });
});

describe("approval view", () => {
  it("says which artifact it proposes to change", () => {
    renderBody(withStructured(proposal));
    expect(screen.getByText(/artifact-1/)).toBeInTheDocument();
  });

  it("distinguishes additions, changes, context, and removals", () => {
    const { container } = renderBody(withStructured(proposal));

    expect(container.querySelector('[data-element-role="added"]')).toBeInTheDocument();
    expect(container.querySelector('[data-element-role="changed"]')).toBeInTheDocument();
    expect(container.querySelector('[data-element-role="context"]')).toBeInTheDocument();
    expect(within(screen.getByTestId("structured-removals")).getByText(/REL-9/)).toBeInTheDocument();
  });

  it("shows a change as a before and after, not merely as changed", () => {
    // An approval view that says "changed" without saying from what is asking the
    // reader to approve something they cannot see.
    renderBody(withStructured(proposal));

    const changes = screen.getAllByTestId("field-changes").map((node) => node.textContent ?? "");
    expect(changes).toContain("label: Ledger → General Ledger");
  });

  it("shows every element it carries, none summarised", () => {
    const { container } = renderBody(withStructured(proposal));
    const drawn = container.querySelectorAll("[data-element-role]");
    expect(drawn).toHaveLength(proposal.data.nodes.length);
  });

  it("presents a new artifact as itself rather than as a set of changes", () => {
    const { container } = renderBody(withStructured(newArtifact));

    expect(screen.queryByText(/Proposed changes/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-element-role="unchanged"]')).toBeInTheDocument();
    expect(container.querySelector('[data-element-role="added"]')).not.toBeInTheDocument();
  });
});

describe("what stays reachable", () => {
  it("keeps the original output available", () => {
    renderBody(withStructured(newArtifact));
    fireEvent.click(screen.getByText(/show original output/));
    expect(screen.getByTestId("structured-raw-output")).toHaveTextContent("the original output");
  });

  it("offers a textual equivalent of what the view displays", () => {
    renderBody(withStructured(proposal));
    fireEvent.click(screen.getByText(/show text equivalent/));

    const text = screen.getByTestId("structured-text-equivalent").textContent ?? "";
    expect(text).toContain("Brand new");
    expect(text).toContain("composition");
    expect(text).toContain("removed relationship: REL-9");
  });

  it("labels the diagram export as derived", () => {
    renderBody(withStructured(newArtifact));
    fireEvent.click(screen.getByText(/show derived diagram syntax/));
    expect(screen.getByText(/an export, not the source/)).toBeInTheDocument();
  });

  it("offers no diagram export for a table, rather than inventing one", () => {
    const table = { schema: S, kind: "table", data: { columns: ["c"], rows: [["v"]] } };
    renderBody(withStructured(table));
    expect(screen.queryByText(/derived diagram syntax/)).not.toBeInTheDocument();
  });
});

describe("declared order and declared kinds survive", () => {
  it("renders sequence messages in their declared order and direction", () => {
    const sequence = {
      schema: S,
      kind: "sequence",
      data: {
        participants: [
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ],
        messages: [
          { from: "a", to: "b", label: "first" },
          { from: "b", to: "a", label: "second" },
          { from: "a", to: "b", label: "third" },
        ],
      },
    };
    const { container } = renderBody(withStructured(sequence));

    const drawn = [...container.querySelectorAll("[data-message-index]")];
    expect(drawn).toHaveLength(3);
    expect(drawn.map((message) => message.querySelector("title")?.textContent)).toEqual([
      "1. first",
      "2. second",
      "3. third",
    ]);

    // Direction, not just order: the second message runs back the other way, which
    // in a lifeline diagram means its arrow ends left of where it starts.
    expect(drawn.map((message) => [message.getAttribute("data-message-from"), message.getAttribute("data-message-to")])).toEqual([
      ["a", "b"],
      ["b", "a"],
      ["a", "b"],
    ]);
    const second = drawn[1].querySelector("line")!;
    expect(Number(second.getAttribute("x2"))).toBeLessThan(Number(second.getAttribute("x1")));
  });

  it("draws a lifeline per participant, so the shape reads as a sequence", () => {
    const sequence = {
      schema: S,
      kind: "sequence",
      data: {
        participants: [
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ],
        messages: [{ from: "a", to: "a", label: "self-call" }],
      },
    };
    const { container } = renderBody(withStructured(sequence));

    // One dashed lifeline per participant, and a self-message drawn as a loop
    // rather than as a zero-length arrow nobody can see.
    expect(container.querySelectorAll("line[stroke-dasharray]")).toHaveLength(2);
    expect(container.querySelector('[data-message-index="0"] path')).toBeInTheDocument();
    expect(container.querySelector('[data-message-index="0"] line')).toBeNull();
  });

  it("renders table columns and rows in their declared order", () => {
    const table = {
      schema: S,
      kind: "table",
      data: {
        columns: ["zebra", "alpha", "middle"],
        rows: [
          ["z1", "a1", "m1"],
          ["z2", "a2", "m2"],
        ],
      },
    };
    const { container } = renderBody(withStructured(table));

    expect([...container.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["zebra", "alpha", "middle"]);
    const firstRow = [...(container.querySelectorAll("tbody tr")[0]?.querySelectorAll("td") ?? [])];
    expect(firstRow.map((cell) => cell.textContent)).toEqual(["z1", "a1", "m1"]);
  });

  it("keeps two relationships between the same pair distinct when their kinds differ", () => {
    const parallel = {
      schema: S,
      kind: "graph",
      data: {
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [
          { from: "a", to: "b", kind: "composition" },
          { from: "a", to: "b", kind: "reference" },
        ],
      },
    };
    const { container } = renderBody(withStructured(parallel));

    // The kind reaches the reader through the hover whether or not the edge is
    // long enough to print it: a label that would overflow into the box it points
    // at is withheld rather than clipped.
    const summaries = [...container.querySelectorAll("g[data-relationship-role] title")].map((t) => t.textContent);
    expect(summaries.some((text) => text?.includes("composition"))).toBe(true);
    expect(summaries.some((text) => text?.includes("reference"))).toBe(true);
  });

  it("accepts a relationship kind it has never seen and does not interpret it", () => {
    const unfamiliar = {
      schema: S,
      kind: "graph",
      data: {
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b", kind: "zzz-entirely-made-up" }],
      },
    };
    expect(structuredExchangePresentation.match(withStructured(unfamiliar))).toBe(true);
    const { container } = renderBody(withStructured(unfamiliar));

    const summaries = [...container.querySelectorAll("g[data-relationship-role] title")].map((t) => t.textContent);
    expect(summaries.some((text) => text?.includes("zzz-entirely-made-up"))).toBe(true);
  });

  it("shows every element of a proposal at the contract's ceiling, none summarised", () => {
    // The scenario that constrains the view: an approval that samples is an
    // approval of something the reader did not see.
    const many = {
      schema: S,
      kind: "graph",
      target: "artifact-1",
      data: {
        nodes: Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })),
        edges: [],
      },
    };
    const { container } = renderBody(withStructured(many));

    expect(container.querySelectorAll("[data-element-role]")).toHaveLength(500);
  });
});

describe("a diagram can leave the application", () => {
  const graph = {
    schema: S,
    kind: "graph",
    target: "arch v4",
    data: { nodes: [{ id: "a", label: "A" }], edges: [] },
  };

  it("offers a download, because a document wants a file", () => {
    // Word does not take an SVG pasted from the clipboard: it wants a file to
    // insert as a picture. Offering only "copy" would look like a feature and fail
    // at the one place it was for.
    renderBody(withStructured(graph));
    expect(screen.getByText(/download SVG/)).toBeInTheDocument();
    expect(screen.getByText(/copy markup/)).toBeInTheDocument();
  });

  it("names the file after what it holds, with nothing a filesystem would refuse", () => {
    const clicked: { download?: string; href?: string }[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = realCreate(tag);
      if (tag === "a") {
        element.click = () => clicked.push({ download: element.getAttribute("download") ?? undefined });
      }
      return element;
    });
    // jsdom has no object URLs
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => "blob:x";
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};

    renderBody(withStructured(graph));
    fireEvent.click(screen.getByText(/download SVG/));

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("graph-arch-v4.svg");
    vi.restoreAllMocks();
  });

  it("hands over markup that stands on its own", () => {
    const { container } = renderBody(withStructured(graph));
    const markup = new XMLSerializer().serializeToString(container.querySelector("svg")!);

    // No stylesheet to leave behind, no foreign content to lose, and a ground of
    // its own so it does not arrive transparent.
    expect(markup).not.toContain("foreignObject");
    expect(markup).not.toContain('class="');
    expect(markup).toContain('fill="#ffffff"');
  });

  it("offers neither for a table, which is not a picture", () => {
    renderBody(withStructured({ schema: S, kind: "table", data: { columns: ["c"], rows: [["v"]] } }));
    expect(screen.queryByText(/download SVG/)).not.toBeInTheDocument();
  });
});

describe("a diagram can be seen at full size", () => {
  // A chat card is a narrow column. Shrinking a real diagram to fit it is how a
  // view becomes unreadable without anyone noticing.
  const graph = {
    schema: S,
    kind: "graph",
    data: { nodes: [{ id: "a", label: "A" }], edges: [] },
  };

  it("offers an enlarge control", () => {
    renderBody(withStructured(graph));
    expect(screen.getByLabelText(/full size/)).toBeInTheDocument();
    expect(screen.queryByTestId("structured-enlarged")).not.toBeInTheDocument();
  });

  it("opens and closes the enlarged view", () => {
    renderBody(withStructured(graph));

    fireEvent.click(screen.getByLabelText(/full size/));
    expect(screen.getByTestId("structured-enlarged")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByTestId("structured-enlarged")).not.toBeInTheDocument();
  });

  it("closes on Escape, so it is never a trap", () => {
    renderBody(withStructured(graph));
    fireEvent.click(screen.getByLabelText(/full size/));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("structured-enlarged")).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked but not the diagram itself", () => {
    renderBody(withStructured(graph));
    fireEvent.click(screen.getByLabelText(/full size/));

    const overlay = screen.getByTestId("structured-enlarged");
    fireEvent.click(overlay.firstElementChild!);
    expect(screen.getByTestId("structured-enlarged")).toBeInTheDocument();

    fireEvent.click(overlay);
    expect(screen.queryByTestId("structured-enlarged")).not.toBeInTheDocument();
  });
});

describe("labels are not silently cut", () => {
  // On an approval view a truncated name is the worst kind of defect: the reader
  // cannot tell it from a short one, and two elements differing past the cut look
  // identical.
  const withLabels = (labels: string[]) => ({
    schema: S,
    kind: "graph",
    data: { nodes: labels.map((label, index) => ({ id: `n${index}`, label })), edges: [] },
  });

  it("widens the boxes to fit a long label", () => {
    const narrow = renderBody(withStructured(withLabels(["A", "B"])));
    const narrowWidth = Number(narrow.container.querySelector("[data-element-role] rect")?.getAttribute("width"));
    narrow.unmount();

    const wide = renderBody(withStructured(withLabels(["Payment Reconciliation Service", "B"])));
    const wideWidth = Number(wide.container.querySelector("[data-element-role] rect")?.getAttribute("width"));

    expect(wideWidth).toBeGreaterThan(narrowWidth);
  });

  it("stops widening past a bound, so one long name cannot stretch the diagram", () => {
    const { container } = renderBody(withStructured(withLabels(["x".repeat(400)])));
    expect(Number(container.querySelector("[data-element-role] rect")?.getAttribute("width"))).toBeLessThanOrEqual(260);
  });

  it("grows the boxes taller when they carry a change", () => {
    // The line that matters most on an approval view is the one saying what the
    // value is becoming; a fixed height cropped it.
    const plain = renderBody(
      withStructured({
        schema: S,
        kind: "graph",
        target: "T",
        data: { nodes: [{ id: "a", ref: "R", label: "Ledger" }], edges: [] },
      }),
    );
    const plainHeight = Number(plain.container.querySelector("[data-element-role] rect")?.getAttribute("height"));
    plain.unmount();

    const changing = renderBody(
      withStructured({
        schema: S,
        kind: "graph",
        target: "T",
        data: { nodes: [{ id: "a", ref: "R", label: "Ledger", set: { label: "General Ledger" } }], edges: [] },
      }),
    );
    expect(Number(changing.container.querySelector("[data-element-role] rect")?.getAttribute("height"))).toBeGreaterThan(plainHeight);
  });

  it("grows taller for a label that needs more than one line", () => {
    const oneLine = renderBody(withStructured(withLabels(["Short"])));
    const oneLineHeight = Number(oneLine.container.querySelector("[data-element-role] rect")?.getAttribute("height"));
    oneLine.unmount();

    const wrapped = renderBody(withStructured(withLabels(["x".repeat(200)])));
    expect(Number(wrapped.container.querySelector("[data-element-role] rect")?.getAttribute("height"))).toBeGreaterThan(oneLineHeight);
  });

  it("offers the full label on hover for whatever still overflows", () => {
    const label = "x".repeat(400);
    const { container } = renderBody(withStructured(withLabels([label])));

    expect(container.querySelector("[data-element-role] title")?.textContent).toContain(label.slice(0, 50));
  });

  it("widens a sequence's lifelines for long participant names", () => {
    const seq = (names: string[]) => ({
      schema: S,
      kind: "sequence",
      data: {
        participants: names.map((label, index) => ({ id: `p${index}`, label })),
        messages: [{ from: "p0", to: "p1", label: "go" }],
      },
    });
    const narrow = renderBody(withStructured(seq(["A", "B"])));
    const narrowWidth = Number(narrow.container.querySelector("[data-element-role] rect")?.getAttribute("width"));
    narrow.unmount();

    const wide = renderBody(withStructured(seq(["Order Management Frontend", "B"])));
    expect(Number(wide.container.querySelector("[data-element-role] rect")?.getAttribute("width"))).toBeGreaterThan(narrowWidth);
  });
});

describe("relationships in a proposal are legible too", () => {
  // The gap the element roles hid: on an architecture proposal, relationships are
  // most of what changes, and a drawn line has only its colour to say so with.
  const graphProposal = {
    schema: S,
    kind: "graph",
    target: "architecture-v4",
    data: {
      nodes: [
        { id: "billing", ref: "EL-12", label: "Billing" },
        { id: "ledger", ref: "EL-7", label: "Ledger" },
        { id: "audit", label: "Audit" },
      ],
      edges: [
        { from: "billing", to: "ledger", ref: "REL-1", kind: "calls" },
        { from: "billing", to: "ledger", ref: "REL-2", kind: "reads", set: { kind: "queries" } },
        { from: "audit", to: "billing", kind: "observes" },
      ],
    },
  };

  it("distinguishes an added, a changed, and a context relationship", () => {
    const { container } = renderBody(withStructured(graphProposal));

    const roles = [...container.querySelectorAll("g[data-relationship-role]")].map((g) =>
      g.getAttribute("data-relationship-role"),
    );
    expect(roles).toEqual(["context", "changed", "added"]);
  });

  it("shows what a changed relationship changes, as a before and after", () => {
    const { container } = renderBody(withStructured(graphProposal));

    // The edge here is short, so the change is withheld from the drawing rather
    // than printed under the box it points at — the hover is the channel that
    // never runs out of room, and it must carry it.
    const summaries = [...container.querySelectorAll("g[data-relationship-role] title")].map((t) => t.textContent);
    expect(summaries.some((text) => text?.includes("kind: reads → queries"))).toBe(true);
  });

  it("draws a context relationship differently from one that is being applied", () => {
    const { container } = renderBody(withStructured(graphProposal));

    const [context, changed] = [...container.querySelectorAll("g[data-relationship-role]")];
    expect(context.querySelector("path")?.getAttribute("stroke-dasharray")).toBe("4 3");
    expect(changed.querySelector("path")?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("does the same for a sequence's messages", () => {
    const sequenceProposal = {
      schema: S,
      kind: "sequence",
      target: "protocol-v2",
      data: {
        participants: [
          { id: "client", ref: "P-1", label: "Client" },
          { id: "api", ref: "P-2", label: "API" },
        ],
        messages: [
          { from: "client", to: "api", ref: "M-1", label: "POST /orders" },
          { from: "api", to: "client", ref: "M-2", label: "200 OK", set: { label: "201 Created" } },
          { from: "client", to: "api", label: "DELETE /orders/1" },
        ],
      },
    };
    const { container } = renderBody(withStructured(sequenceProposal));

    expect([...container.querySelectorAll("g[data-relationship-role]")].map((g) => g.getAttribute("data-relationship-role"))).toEqual([
      "context",
      "changed",
      "added",
    ]);
    expect([...container.querySelectorAll('[data-testid="relationship-change"]')].map((n) => n.textContent)).toEqual([
      "label: 200 OK → 201 Created",
    ]);
  });

  it("marks nothing on a relationship when the envelope is not a proposal", () => {
    const newArtifactGraph = {
      schema: S,
      kind: "graph",
      data: {
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b", kind: "calls" }],
      },
    };
    const { container } = renderBody(withStructured(newArtifactGraph));

    expect([...container.querySelectorAll("g[data-relationship-role]")].map((g) => g.getAttribute("data-relationship-role"))).toEqual([
      "unchanged",
    ]);
  });
});

describe("an approved proposal survives unaltered", () => {
  it("keeps the document exactly as it was validated, not a re-serialisation of it", () => {
    // Indented as the producer wrote it: a parse-and-restringify would compact it,
    // so an implementation that rebuilt the document would fail the last assertion.
    const asSent = JSON.stringify(
      { kind: "graph", schema: S, data: { edges: [], nodes: [{ label: "A", id: "a" }] } },
      null,
      2,
    );
    const item = tool({ structured: asSent });

    // Validation reads the document; it never rewrites what is carried.
    expect(structuredExchangePresentation.match(item)).toBe(true);
    expect(item.structured).toBe(asSent);
    expect(item.structured).not.toBe(JSON.stringify(JSON.parse(asSent)));
  });
});

describe("producer text is data, not markup", () => {
  it("renders markup-like labels as text", () => {
    const hostile = {
      schema: S,
      kind: "graph",
      data: { nodes: [{ id: "a", label: "<img src=x onerror=alert(1)>" }], edges: [] },
    };
    const { container } = renderBody(withStructured(hostile));

    expect(container.querySelector("img")).toBeNull();
    // Once in the drawn label and once in the hover, both as text
    expect(screen.getAllByText("<img src=x onerror=alert(1)>").length).toBeGreaterThan(0);
  });
});

describe("labels the producer wrote on two lines", () => {
  // Real producers write a name and the thing that qualifies it — "Batterie HV"
  // over "400-800V". Splitting on all whitespace reflowed the two into one
  // paragraph and lost the distinction they meant.
  const twoLine = {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "batt", label: "Batterie HV\n400-800V" },
        { id: "bms", label: "BMS\nGestion batterie" },
      ],
      edges: [{ from: "bms", to: "batt", kind: "sense" }],
    },
  };

  it("keeps the break the producer asked for", () => {
    const { container } = renderBody(withStructured(twoLine));

    const first = [...container.querySelectorAll("[data-element-role]")][0];
    const lines = [...first.querySelectorAll("tspan")].map((line) => line.textContent);
    expect(lines).toEqual(["Batterie HV", "400-800V"]);
  });

  it("sizes the box to its longest line, not to the whole string", () => {
    const { container } = renderBody(withStructured(twoLine));
    const width = Number(container.querySelector("[data-element-role] rect")?.getAttribute("width"));

    // "Gestion batterie" is the longest line at 16 characters; the concatenation
    // would be 20 and would make every box needlessly wide.
    expect(width).toBeLessThan(20 * 6.6 + 22);
  });

  it("still draws at a readable height rather than collapsing to a line", () => {
    const { container } = renderBody(withStructured(twoLine));
    const svg = container.querySelector("svg")!;

    // The symptom that started this: a diagram scaled into the chat column until
    // it was a few pixels tall. It keeps its own size and scrolls instead.
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(40);
    // No max-width to scale it down; the container scrolls instead
    expect(svg.getAttribute("style") ?? "").not.toContain("max-width");
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });
});

describe("colour carries type, and the key travels with the picture", () => {
  const typed = {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "batt", label: "Battery", kind: "storage" },
        { id: "inv", label: "Inverter", kind: "converter" },
        { id: "mot", label: "Motor", kind: "actuator" },
      ],
      edges: [
        { from: "batt", to: "inv", kind: "power" },
        { from: "inv", to: "mot", kind: "power" },
      ],
    },
  };

  it("gives the same type the same colour, and different types different ones", () => {
    renderBody(withStructured(typed));
    const boxes = document.querySelectorAll("[data-element-role] rect");
    const fills = [...boxes].map((box) => box.getAttribute("fill"));

    expect(new Set(fills).size).toBe(3);
    expect(fills.every((fill) => fill !== null && fill !== "")).toBe(true);
  });

  it("draws the same type the same colour across two renders of the same document", () => {
    const first = renderBody(withStructured(typed));
    const fillOf = () =>
      [...document.querySelectorAll("[data-element-role] rect")].map((box) => box.getAttribute("fill"));
    const before = fillOf();
    first.unmount();

    renderBody(withStructured(typed));
    expect(fillOf()).toEqual(before);
  });

  it("names every type present in a key inside the SVG, so an exported figure explains itself", () => {
    renderBody(withStructured(typed));
    const legend = screen.getByTestId("diagram-legend");

    // Inside the SVG, not beside it on the page
    expect(legend.closest("svg")).not.toBeNull();
    const named = [...legend.querySelectorAll("text")].map((text) => text.textContent);
    expect(named).toEqual(expect.arrayContaining(["storage", "converter", "actuator", "power"]));
  });

  it("offers no key when the document declares no types", () => {
    // A key listing nothing is noise, and it would take up room in the export.
    renderBody(withStructured(newArtifact));
    expect(screen.queryByTestId("diagram-legend")).toBeNull();
  });

  it("keeps the approval signal when a proposal is also typed", () => {
    // Type takes the fill; role must still own the outline, or an added element
    // becomes indistinguishable from an existing one of the same type.
    const typedProposal = {
      ...proposal,
      data: {
        nodes: [
          { id: "keep", ref: "EL-1", label: "Existing", kind: "service" },
          { id: "fresh", label: "Brand new", kind: "service" },
        ],
        edges: [],
      },
    };
    renderBody(withStructured(typedProposal));

    const added = document.querySelector('[data-element-role="added"] rect')!;
    const context = document.querySelector('[data-element-role="context"] rect')!;

    // Same type, so the same fill…
    expect(added.getAttribute("fill")).toBe(context.getAttribute("fill"));
    // …and the role still tells them apart, by outline and by weight
    expect(added.getAttribute("stroke")).not.toBe(context.getAttribute("stroke"));
    expect(Number(added.getAttribute("stroke-width"))).toBeGreaterThan(
      Number(context.getAttribute("stroke-width")),
    );
  });

  it("explains the roles in the key too, but only for a proposal", () => {
    renderBody(withStructured(proposal));
    const named = [...screen.getByTestId("diagram-legend").querySelectorAll("text")].map((t) => t.textContent);
    expect(named).toEqual(expect.arrayContaining(["added"]));
  });

  it("tips an arrow in the colour of the line it ends", () => {
    // Keyed by role, a type-coloured relationship got a grey arrowhead.
    renderBody(withStructured(typed));
    const line = document.querySelector("[data-relationship-role] path")!;
    const stroke = line.getAttribute("stroke")!;
    const marker = line.getAttribute("marker-end")!.replace(/^url\(#|\)$/g, "");

    const tip = document.getElementById(marker)!.querySelector("path")!;
    expect(tip.getAttribute("fill")).toBe(stroke);
  });
});

describe("filtering, without weakening the approval gate", () => {
  const typed = {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "batt", label: "Battery", kind: "storage" },
        { id: "inv", label: "Inverter", kind: "converter" },
        { id: "mot", label: "Motor", kind: "actuator" },
      ],
      edges: [
        { from: "batt", to: "inv", kind: "power" },
        { from: "inv", to: "mot", kind: "power" },
      ],
    },
  };
  const entry = (key: string) => document.querySelector(`[data-legend-entry="${key}"]`)!;

  it("shows everything until the reader hides something", () => {
    renderBody(withStructured(typed));
    expect(document.querySelectorAll("[data-element-role]").length).toBe(3);
    expect(screen.queryByTestId("structured-filtered")).toBeNull();
  });

  it("hides a type when its key entry is clicked, and brings it back on a second click", () => {
    renderBody(withStructured(typed));

    toggleLegend("element:converter");
    expect(document.querySelectorAll("[data-element-role]").length).toBe(2);

    toggleLegend("element:converter");
    expect(document.querySelectorAll("[data-element-role]").length).toBe(3);
  });

  it("drops a relationship whose end has gone, rather than drawing a line to nowhere", () => {
    renderBody(withStructured(typed));
    toggleLegend("element:converter");
    // Both relationships ended at the inverter
    expect(document.querySelectorAll("[data-relationship-role]").length).toBe(0);
  });

  it("hides a relationship type on its own without touching the elements", () => {
    renderBody(withStructured(typed));
    toggleLegend("relationship:power");

    expect(document.querySelectorAll("[data-relationship-role]").length).toBe(0);
    expect(document.querySelectorAll("[data-element-role]").length).toBe(3);
  });

  it("says on screen that the picture is no longer the whole document", () => {
    // The view is an approval gate. A reader approving a filtered picture has to
    // know they are doing it.
    renderBody(withStructured(typed));
    toggleLegend("element:converter");

    const banner = screen.getByTestId("structured-filtered");
    expect(banner.textContent).toContain("converter");
    expect(banner.textContent).toMatch(/filtered/i);
  });

  it("keeps a hidden type in the key, marked hidden, so an exported figure says what is missing", () => {
    // The banner is HTML and stays behind on export; the key is inside the SVG.
    renderBody(withStructured(typed));
    toggleLegend("element:converter");

    const stillListed = entry("element:converter");
    expect(stillListed.closest("svg")).not.toBeNull();
    expect(stillListed.getAttribute("data-hidden")).toBe("true");
    expect(stillListed.querySelector("text")!.textContent).toBe("converter (hidden)");
  });

  it("never marks a hidden type the way it marks a removed one", () => {
    // A removal is struck through a few pixels away in the same view. Reusing that
    // for "switched off" would read, on a proposal, as a type being taken out of it.
    renderBody(withStructured(typed));
    toggleLegend("element:converter");

    expect(entry("element:converter").querySelector("text")!.getAttribute("text-decoration")).toBeNull();
  });

  it("restores everything from the banner", () => {
    renderBody(withStructured(typed));
    toggleLegend("element:converter");
    fireEvent.click(screen.getByText("show everything"));

    expect(document.querySelectorAll("[data-element-role]").length).toBe(3);
    expect(screen.queryByTestId("structured-filtered")).toBeNull();
  });

  it("tells assistive technology that what it is describing is a subset", () => {
    renderBody(withStructured(typed));
    toggleLegend("element:converter");

    const svg = document.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute("aria-label")).toMatch(/filtered to 2 elements/);
  });

  it("keeps a type's colour when another type is hidden", () => {
    // Re-assigning colours over the visible subset would repaint the diagram every
    // time the reader toggled something, which is exactly when they are comparing.
    renderBody(withStructured(typed));
    const fillOf = (id: string) =>
      [...document.querySelectorAll("[data-element-role]")]
        .find((box) => box.querySelector("title")?.textContent?.includes(id))
        ?.querySelector("rect")
        ?.getAttribute("fill");

    const before = fillOf("Battery");
    toggleLegend("element:converter");
    expect(fillOf("Battery")).toBe(before);
  });
});

describe("moving around the diagram", () => {
  const typed = {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "a", label: "A", kind: "block" },
        { id: "b", label: "B", kind: "block" },
      ],
      edges: [{ from: "a", to: "b", kind: "calls" }],
    },
  };

  /** jsdom reports no layout, so a scrollable ancestor has to be declared. */
  const scrollable = (element: HTMLElement, over: number) => {
    Object.defineProperty(element, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(element, "clientWidth", { value: 1000 - over, configurable: true });
    Object.defineProperty(element, "scrollHeight", { value: 100, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
    element.scrollLeft = 200;
    element.scrollTop = 0;
    return element;
  };

  const press = (target: Element, type: string, x: number, y: number) =>
    target.dispatchEvent(
      Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }), {
        pointerId: 1,
      }),
    );

  it("pans the view when the ground is dragged, without moving anything in the drawing", () => {
    renderBody(withStructured(typed));
    const svg = document.querySelector('svg[role="img"]')! as SVGSVGElement;
    const box = svg.querySelector('[data-element-role] rect')!;
    const before = box.getAttribute("x");
    const scroller = scrollable(svg.parentElement as HTMLElement, 400);

    press(svg, "pointerdown", 500, 50);
    press(svg, "pointermove", 440, 50);
    press(svg, "pointerup", 440, 50);

    // The box scrolled into view; it did not move on the canvas, so the export is
    // exactly what it was.
    expect(scroller.scrollLeft).toBe(260);
    expect(box.getAttribute("x")).toBe(before);
  });

  it("leaves a press that landed on a box to that box, so panning cannot fight dragging", () => {
    renderBody(withStructured(typed));
    const svg = document.querySelector('svg[role="img"]')! as SVGSVGElement;
    const scroller = scrollable(svg.parentElement as HTMLElement, 400);
    const node = svg.querySelector('[data-draggable="node"]')!;

    press(node, "pointerdown", 500, 50);
    press(svg, "pointermove", 440, 50);

    expect(scroller.scrollLeft).toBe(200);
  });
});

describe("the two type vocabularies are independent", () => {
  // "power" is a plausible kind of block and a plausible kind of connection. Held in
  // one namespace, hiding either hid both.
  const shared = {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "a", label: "Pack", kind: "power" },
        { id: "b", label: "Motor", kind: "drive" },
      ],
      edges: [{ from: "a", to: "b", kind: "power" }],
    },
  };
  const entry = (key: string) => document.querySelector(`[data-legend-entry="${key}"]`)!;

  it("hides a relationship type without hiding an element type of the same name", () => {
    renderBody(withStructured(shared));
    toggleLegend("relationship:power");

    expect(document.querySelectorAll("[data-relationship-role]").length).toBe(0);
    expect(document.querySelectorAll("[data-element-role]").length).toBe(2);
  });

  it("hides an element type without hiding a relationship type of the same name", () => {
    renderBody(withStructured(shared));
    toggleLegend("element:power");

    // The element goes, and the relationship goes with it only because it lost an end
    expect(document.querySelectorAll("[data-element-role]").length).toBe(1);
    // …and the relationship's own type is still switched on
    expect(entry("relationship:power").getAttribute("data-hidden")).toBeNull();
  });

  it("lists the shared name once per vocabulary", () => {
    renderBody(withStructured(shared));
    expect(entry("element:power")).not.toBeNull();
    expect(entry("relationship:power")).not.toBeNull();
  });

  it("names the type plainly in the banner, not by its internal key", () => {
    renderBody(withStructured(shared));
    toggleLegend("relationship:power");
    expect(screen.getByTestId("structured-filtered").textContent).toContain("power");
    expect(screen.getByTestId("structured-filtered").textContent).not.toContain("relationship:power");
  });
});

describe("a gesture never outlives what it was made on", () => {
  const typed = {
    schema: S,
    kind: "graph",
    data: { nodes: [{ id: "a", label: "A", kind: "block" }], edges: [] },
  };

  it("starts a drag where the pointer-capture API is missing entirely", () => {
    // jsdom has no pointer capture. Calling it unguarded threw inside a handler,
    // which surfaced as an unhandled rejection: every assertion passed and the suite
    // still exited non-zero.
    const view = renderBody(withStructured(typed));
    const node = document.querySelector('[data-draggable="node"]')!;

    expect(() =>
      node.dispatchEvent(
        Object.assign(new MouseEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5, button: 0 }), {
          pointerId: 1,
        }),
      ),
    ).not.toThrow();
    view.unmount();
  });

  it("drops its listeners when the component goes away mid-drag", () => {
    const view = renderBody(withStructured(typed));
    const node = document.querySelector('[data-draggable="node"]')! as HTMLElement;
    const removals: string[] = [];
    const realRemove = node.removeEventListener.bind(node);
    node.removeEventListener = (type: string, ...rest: unknown[]) => {
      removals.push(type);
      return realRemove(type, ...(rest as [EventListenerOrEventListenerObject]));
    };

    node.dispatchEvent(
      Object.assign(new MouseEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5, button: 0 }), {
        pointerId: 1,
      }),
    );
    view.unmount();

    expect(removals).toEqual(expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]));
  });
});

describe("every declared relationship is a relationship you can see", () => {
  const graphOf = (edges: unknown[]) => ({
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges,
    },
  });
  const paths = () =>
    [...document.querySelectorAll("[data-relationship-role] path")].map((p) => p.getAttribute("d")!);

  /** Sample a path so two shapes can be compared as geometry rather than as strings. */
  const pointsOf = (d: string) =>
    (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).reduce<{ x: number; y: number }[]>((acc, n, i, all) => {
      if (i % 2 === 0 && i + 1 < all.length) acc.push({ x: n, y: all[i + 1] });
      return acc;
    }, []);

  it("draws a relationship from something to itself as a shape with real extent", () => {
    // A straight line between one box's centre and itself has zero length: the
    // document declared a relationship and the picture showed nothing at all.
    renderBody(withStructured(graphOf([{ from: "a", to: "a", kind: "feeds" }])));
    const [d] = paths();

    expect(d).toBeDefined();
    const points = pointsOf(d);
    const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const spanY = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    expect(spanX).toBeGreaterThan(10);
    expect(spanY).toBeGreaterThan(10);
    expect(document.querySelector('[data-relationship-shape="loop"]')).not.toBeNull();
  });

  it("keeps several loops on one element apart from each other", () => {
    renderBody(
      withStructured(
        graphOf([
          { from: "a", to: "a", kind: "feeds" },
          { from: "a", to: "a", kind: "senses" },
        ]),
      ),
    );
    const drawn = paths();
    expect(drawn).toHaveLength(2);
    expect(drawn[0]).not.toBe(drawn[1]);
  });

  it("draws two relationships between the same pair as two distinct shapes", () => {
    // Straight lines between centres put these on exactly the same pixels, so a
    // reader counting connections counted one where the document had two.
    renderBody(
      withStructured(
        graphOf([
          { from: "a", to: "b", kind: "power" },
          { from: "a", to: "b", kind: "signal" },
        ]),
      ),
    );
    const drawn = paths();

    expect(drawn).toHaveLength(2);
    expect(drawn[0]).not.toBe(drawn[1]);
    // …and genuinely apart, not merely different strings
    const [first, second] = drawn.map(pointsOf);
    const apart = Math.max(...second.map((p, i) => Math.hypot(p.x - (first[i]?.x ?? p.x), p.y - (first[i]?.y ?? p.y))));
    expect(apart).toBeGreaterThan(8);
  });

  it("fans three relationships between one pair to either side of the straight run", () => {
    renderBody(
      withStructured(
        graphOf([
          { from: "a", to: "b", kind: "one" },
          { from: "a", to: "b", kind: "two" },
          { from: "a", to: "b", kind: "three" },
        ]),
      ),
    );
    const drawn = paths();
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    // The first is the straight run; the other two curve, one each way
    expect(drawn[0]).toMatch(/^M [\d.-]+ [\d.-]+ L/);
    expect(drawn[1]).toContain("Q");
    expect(drawn[2]).toContain("Q");
  });

  it("gives opposite directions between the same pair their own straight run each", () => {
    // A→B and B→A are not the same pair, and neither should be pushed off the
    // straight line to make room for the other.
    renderBody(
      withStructured(
        graphOf([
          { from: "a", to: "b", kind: "requests" },
          { from: "b", to: "a", kind: "replies" },
        ]),
      ),
    );
    const drawn = paths();
    expect(drawn).toHaveLength(2);
    expect(drawn[0]).not.toBe(drawn[1]);
    // Neither is a rank bow — a single quadratic from end to end with nothing in
    // between, which is what a relationship pushed aside to make room looks like.
    // Either may still curve, because the layout engine routes a back edge around
    // what it passes and that is the route being followed.
    for (const d of drawn) expect(d, `${d} should not be a rank bow`).not.toMatch(/^M [\d.-]+ [\d.-]+ Q [^LQ]+$/);
  });

  it("keeps direction, arrow, type and hover on every shape it draws", () => {
    renderBody(
      withStructured(
        graphOf([
          { from: "a", to: "b", kind: "power" },
          { from: "a", to: "b", kind: "signal" },
          { from: "a", to: "a", kind: "feeds" },
        ]),
      ),
    );
    const groups = [...document.querySelectorAll("[data-relationship-role]")];
    expect(groups).toHaveLength(3);

    for (const group of groups) {
      const path = group.querySelector("path")!;
      expect(path.getAttribute("marker-end")).toMatch(/^url\(#se-arrow-/);
      expect(path.getAttribute("fill")).toBe("none");
      expect(group.querySelector("title")!.textContent).toBeTruthy();
    }
    // The types are all shown, so two parallel relationships stay tellable apart
    expect(document.querySelector("svg")!.textContent).toContain("power");
    expect(document.querySelector("svg")!.textContent).toContain("signal");
  });

  it("follows the layout engine's route rather than cutting across the boxes between", () => {
    // A long relationship in a layered graph is routed around whatever sits in the
    // ranks it spans; a straight line between centres draws over them.
    renderBody(
      withStructured({
        schema: S,
        kind: "graph",
        data: {
          nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() })),
          edges: [
            { from: "a", to: "b", kind: "k" },
            { from: "b", to: "c", kind: "k" },
            { from: "c", to: "d", kind: "k" },
            { from: "a", to: "d", kind: "k" },
          ],
        },
      }),
    );
    const spanning = paths().find((d) => (d.match(/L/g) ?? []).length > 1);
    expect(spanning, "the relationship spanning three ranks should be a routed polyline").toBeDefined();
  });

  it("turns its corners as curves rather than as kinks", () => {
    // A route drawn as bare segments turns through hard angles, which read as a
    // broken line rather than as a path going somewhere.
    renderBody(
      withStructured({
        schema: S,
        kind: "graph",
        data: {
          nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() })),
          edges: [
            { from: "a", to: "b", kind: "k" },
            { from: "b", to: "c", kind: "k" },
            { from: "c", to: "d", kind: "k" },
            { from: "a", to: "d", kind: "k" },
          ],
        },
      }),
    );

    const routed = paths().find((d) => (d.match(/L/g) ?? []).length > 1)!;
    expect(routed).toContain("Q");
    // Every corner rounded, so none is left as a bare angle
    expect((routed.match(/Q/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("leaves a two-point route alone rather than inventing a curve in it", () => {
    renderBody(
      withStructured(graphOf([{ from: "a", to: "b", kind: "k" }])),
    );
    expect(paths()[0]).not.toContain("Q");
  });
});

describe("what an export of a filtered view claims", () => {
  const typedProposal = {
    schema: S,
    kind: "graph",
    target: "artifact-1",
    data: {
      nodes: [
        { id: "keep", ref: "EL-1", label: "Existing", kind: "service" },
        { id: "store", ref: "EL-2", label: "Ledger", kind: "datastore" },
        { id: "fresh", label: "Brand new", kind: "service" },
      ],
      edges: [{ from: "fresh", to: "store", kind: "writes" }],
    },
  };
  const entry = (key: string) => document.querySelector(`[data-legend-entry="${key}"]`)!;

  /**
   * The decision, stated once: an export carries the view the reader is looking at,
   * and the figure says so on its face. Exporting the whole document instead would
   * hand back something the reader never saw, which is the worse failure for an
   * approval gate — but a filtered figure must never read as a smaller proposal.
   */
  it("draws only what is shown, and says so inside the figure", () => {
    renderBody(withStructured(typedProposal));
    toggleLegend("element:datastore");

    const svg = document.querySelector('svg[role="img"]')!;
    expect(svg.querySelectorAll("[data-element-role]").length).toBe(2);

    const note = screen.getByTestId("diagram-filter-note");
    expect(note.closest("svg")).not.toBeNull();
    expect(note.textContent).toContain("2 of 3 elements");
  });

  it("says on a proposal that a hidden type is still part of it", () => {
    renderBody(withStructured(typedProposal));
    toggleLegend("element:datastore");

    expect(screen.getByTestId("diagram-filter-note").textContent).toContain(
      "Hidden types are still part of the proposal",
    );
  });

  it("carries that note into the serialized markup, not only onto the screen", () => {
    renderBody(withStructured(typedProposal));
    toggleLegend("element:datastore");

    const markup = new XMLSerializer().serializeToString(document.querySelector('svg[role="img"]')!);
    expect(markup).toContain("2 of 3 elements");
    expect(markup).toContain("datastore (hidden)");
  });

  it("makes no such claim when nothing is filtered", () => {
    renderBody(withStructured(typedProposal));
    expect(screen.queryByTestId("diagram-filter-note")).toBeNull();
  });
});

describe("a long type name is not quietly cut off", () => {
  it("widens a narrow diagram to fit the key that explains it", () => {
    // The schema allows a hundred-character type name and the canvas width came from
    // the graph alone, so a two-node diagram drew a key that ran off the viewBox.
    const long = "a-very-long-domain-specific-stereotype-name-that-keeps-going";
    renderBody(
      withStructured({
        schema: S,
        kind: "graph",
        data: { nodes: [{ id: "a", label: "A", kind: long }], edges: [] },
      }),
    );

    const svg = document.querySelector('svg[role="img"]')!;
    const [, , width] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const label = [...svg.querySelectorAll("[data-legend-entry] text")].find((t) =>
      t.textContent!.includes(long),
    )!;

    expect(Number(label.getAttribute("x")) + long.length * 5.6).toBeLessThanOrEqual(width);
  });
});

describe("the text equivalent says everything the picture says", () => {
  /**
   * A reader is on the text equivalent because they cannot see the diagram. Anything
   * only the diagram says is, for them, not said at all — so this checks the words
   * against the document, not against the SVG.
   */
  const textOf = (document_: unknown) => {
    renderBody(withStructured(document_));
    fireEvent.click(screen.getByText("show text equivalent"));
    return screen.getByTestId("structured-text-equivalent").textContent!;
  };

  const graph = {
    schema: S,
    kind: "graph",
    target: "artifact-1",
    removals: [{ type: "relationship", ref: "REL-9" }],
    data: {
      nodes: [
        { id: "batt", ref: "EL-1", label: "Battery", kind: "storage" },
        { id: "bms", ref: "EL-2", label: "BMS", kind: "controller", set: { label: "Battery manager" } },
        { id: "orphan", label: "Spare", kind: "storage" },
        { id: "mot", label: "Motor", kind: "actuator" },
      ],
      edges: [
        { from: "batt", to: "mot", kind: "power", label: "traction bus" },
        { from: "bms", to: "batt", kind: "control" },
        { from: "bms", to: "bms", kind: "diagnostic" },
      ],
    },
  };

  it("names every element, including one nothing connects to", () => {
    const text = textOf(graph);
    for (const name of ["Battery", "BMS", "Spare", "Motor"]) expect(text).toContain(name);
  });

  it("states each element's type, which the diagram carries only as a colour", () => {
    const text = textOf(graph);
    for (const kind of ["storage", "controller", "actuator"]) expect(text).toContain(`[${kind}]`);
  });

  it("keeps both a relationship's type and its label when it declares both", () => {
    // One standing in for the other lost whichever the traversal did not prefer.
    const text = textOf(graph);
    expect(text).toContain("power");
    expect(text).toContain("traction bus");
  });

  it("prefers the same name the diagram draws", () => {
    // The diagram draws `label ?? kind` and the words used to prefer `kind ?? label`,
    // so the two disagreed about what a thing was called.
    const text = textOf({
      schema: S,
      kind: "graph",
      data: { nodes: [{ id: "a", label: "Ledger", kind: "datastore" }], edges: [] },
    });
    expect(text.split("\n").some((line) => line.startsWith("Ledger"))).toBe(true);
  });

  it("says a relationship goes to itself, which the diagram says with a loop", () => {
    expect(textOf(graph)).toContain("to itself");
  });

  it("reports additions, changes and removals without the picture", () => {
    const text = textOf(graph);
    expect(text).toContain("added");
    expect(text).toContain("changed");
    expect(text).toContain("Ledger" === "" ? "" : "Battery manager");
    expect(text).toContain("removed relationship: REL-9");
  });

  it("counts what there is, so a reader knows how much they are not seeing", () => {
    expect(textOf(graph)).toContain("4 elements, 3 relationships");
  });

  const sequence = {
    schema: S,
    kind: "sequence",
    target: "artifact-2",
    data: {
      participants: [
        { id: "user", label: "User", kind: "actor" },
        { id: "api", label: "API", kind: "service" },
        { id: "idle", label: "Audit", kind: "service" },
      ],
      messages: [
        { from: "user", to: "api", label: "submit" },
        { from: "api", to: "user", label: "receipt" },
      ],
    },
  };

  it("lists sequence participants, including one no message reaches", () => {
    // The words used to walk the messages only, so a participant drawn on screen with
    // its own lifeline was missing from the account entirely.
    const text = textOf(sequence);
    for (const name of ["User", "API", "Audit"]) expect(text).toContain(name);
    expect(text).toContain("3 participants, 2 messages");
  });

  it("states a participant's type too", () => {
    const text = textOf(sequence);
    expect(text).toContain("[actor]");
    expect(text).toContain("[service]");
  });

  it("keeps the messages numbered and in their declared order", () => {
    const text = textOf(sequence);
    expect(text.indexOf("1. User")).toBeGreaterThan(-1);
    expect(text.indexOf("1. User")).toBeLessThan(text.indexOf("2. API"));
  });
});

describe("the canvas gesture does not swallow the controls drawn on it", () => {
  const typed = {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "a", label: "A", kind: "block" },
        { id: "b", label: "B", kind: "store" },
      ],
      edges: [{ from: "a", to: "b", kind: "calls" }],
    },
  };

  const scrollable = (element: HTMLElement) => {
    Object.defineProperty(element, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(element, "clientWidth", { value: 600, configurable: true });
    Object.defineProperty(element, "scrollHeight", { value: 100, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
    element.scrollLeft = 200;
    return element;
  };

  it("declines a press that landed on the key, so the key stays clickable", () => {
    /**
     * The regression this exists for: panning ran on any press on the canvas, called
     * preventDefault, and captured the pointer — which suppresses the click the
     * browser would otherwise deliver. Filtering was completely inert in the browser
     * while the suite stayed green, because the tests dispatched a click directly at
     * the entry and never made the press that came before it.
     *
     * jsdom does not model click suppression, so what is asserted here is the cause
     * rather than the symptom: the pan gesture must not start at all.
     */
    renderBody(withStructured(typed));
    const svg = document.querySelector('svg[role="img"]')! as SVGSVGElement;
    const scroller = scrollable(svg.parentElement as HTMLElement);
    const entry = document.querySelector('[data-legend-entry="element:block"] text')!;

    entry.dispatchEvent(
      Object.assign(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 500, clientY: 50, button: 0 }), {
        pointerId: 1,
      }),
    );
    svg.dispatchEvent(
      Object.assign(new MouseEvent("pointermove", { bubbles: true, clientX: 400, clientY: 50, button: 0 }), { pointerId: 1 }),
    );

    expect(scroller.scrollLeft, "a press on the key must not begin a pan").toBe(200);
  });

  it("does not cancel the browser's default on a press that belongs to the key", () => {
    renderBody(withStructured(typed));
    const entry = document.querySelector('[data-legend-entry="element:block"] text')!;
    const press = Object.assign(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 5, clientY: 5, button: 0 }),
      { pointerId: 1 },
    );

    entry.dispatchEvent(press);

    // preventDefault here is exactly what suppresses the click that follows
    expect(press.defaultPrevented).toBe(false);
  });

  it("still pans from the ground beside the drawing", () => {
    renderBody(withStructured(typed));
    const svg = document.querySelector('svg[role="img"]')! as SVGSVGElement;
    const scroller = scrollable(svg.parentElement as HTMLElement);

    svg.dispatchEvent(
      Object.assign(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 500, clientY: 50, button: 0 }), {
        pointerId: 1,
      }),
    );
    svg.dispatchEvent(
      Object.assign(new MouseEvent("pointermove", { bubbles: true, clientX: 440, clientY: 50, button: 0 }), { pointerId: 1 }),
    );

    expect(scroller.scrollLeft).toBe(260);
  });
});
