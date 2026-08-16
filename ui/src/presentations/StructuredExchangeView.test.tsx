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
    expect(context.querySelector("line")?.getAttribute("stroke-dasharray")).toBe("4 3");
    expect(changed.querySelector("line")?.getAttribute("stroke-dasharray")).toBeNull();
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
