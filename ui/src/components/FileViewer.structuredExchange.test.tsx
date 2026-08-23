/**
 * A structured-exchange document opened as a *file*.
 *
 * The claim under test is not "JSON renders as a diagram" — it is that the
 * document decides, by what it declares, and that every other JSON file keeps the
 * display it has today. The four outcomes are deliberately distinct and are
 * asserted apart: rendered, shown as text because it is not ours, shown as text
 * with a reason because it names a version we do not implement, and reported as
 * invalid because it declares one we do and fails it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { STRUCTURED_EXCHANGE_SCHEMA_V1 as S } from "@pi-outpost/shared/structured-exchange";
import { FileViewer } from "./FileViewer";
import type { OpenFile } from "../useAgent";

const documentText = JSON.stringify(
  {
    schema: S,
    kind: "graph",
    data: {
      nodes: [
        { id: "batt", label: "Batterie", kind: "power" },
        { id: "ecu", label: "Calculateur", kind: "compute" },
      ],
      edges: [{ from: "batt", to: "ecu", label: "400V", kind: "signal" }],
    },
  },
  null,
  2,
);

type Props = React.ComponentProps<typeof FileViewer>;

function setup(content: string, path = "diagrams/architecture.json", overrides: Partial<Props> = {}) {
  const file: OpenFile = { status: "loaded", path, content, size: content.length, mtimeMs: 1000 };
  const props: Props = {
    file,
    isStreaming: false,
    gitDiff: null,
    gitAvailable: false,
    onDirtyChange: vi.fn(),
    onFetchGitDiff: vi.fn(),
    onClearGitDiff: vi.fn(),
    onOpenGitHistory: vi.fn(),
    onClose: vi.fn(),
    onReload: vi.fn(),
    onSave: vi.fn(),
    onImageLoad: vi.fn(),
    ...overrides,
  };
  return render(<FileViewer {...props} />);
}

describe("a structured-exchange document opened as a file", () => {
  it("is displayed as the rendering it describes", () => {
    setup(documentText);
    expect(screen.getByTestId("file-structured-exchange")).toBeInTheDocument();
    // The rendering itself, not merely the container it sits in.
    expect(document.querySelector("svg")).not.toBeNull();
    // Drawn more than once — the box and the accessible text equivalent both name it.
    expect(screen.getAllByText("Batterie").length).toBeGreaterThan(0);
  });

  it("is recognised by what it declares, not by its name", () => {
    // Same extension, same shape of content — one says it is a structured
    // exchange and one does not, and only the first is drawn.
    setup(JSON.stringify({ kind: "graph", data: { nodes: [], edges: [] } }), "diagrams/architecture.json");
    expect(screen.queryByTestId("file-structured-exchange")).toBeNull();
    expect(screen.queryByTestId("file-structured-exchange-invalid")).toBeNull();
    expect(screen.getByText(/"kind"/)).toBeInTheDocument();
  });

  it("is drawn whatever it is called", () => {
    setup(documentText, "notes/exchange.txt");
    expect(screen.getByTestId("file-structured-exchange")).toBeInTheDocument();
  });

  it("keeps the narrowing and the export a reader has anywhere else", () => {
    setup(documentText);
    expect(screen.getByRole("button", { name: /download SVG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy markup/ })).toBeInTheDocument();
    // The legend is what narrowing is done from, and it carries the keys the
    // toggle acts on — one per kind the document declares.
    expect(document.querySelector('[data-legend-entry="element:power"]')).not.toBeNull();
    expect(document.querySelector('[data-legend-entry="relationship:signal"]')).not.toBeNull();
  });

  it("narrows by kind, from the file, and says the view is no longer whole", () => {
    setup(documentText);
    const entry = document.querySelector('[data-legend-entry="relationship:signal"]')!;
    const target = entry.querySelector("text") ?? entry;
    const at = { clientX: 5, clientY: 5, button: 0, bubbles: true, cancelable: true };
    target.dispatchEvent(Object.assign(new MouseEvent("pointerdown", at), { pointerId: 1 }));
    target.dispatchEvent(Object.assign(new MouseEvent("pointerup", at), { pointerId: 1 }));
    fireEvent.click(target);
    expect(screen.getByTestId("structured-filtered")).toHaveTextContent(/signal hidden/);
  });

  it("keeps the document as written one action away", () => {
    setup(documentText);
    fireEvent.click(screen.getByRole("button", { name: /source/ }));
    expect(screen.queryByTestId("file-structured-exchange")).toBeNull();
    expect(screen.getByText(/urn:structured-exchange:1/)).toBeInTheDocument();
  });

  it("says what failed when a document declares the schema and does not satisfy it", () => {
    // `kind` is required and the data does not match it: this is the producer's
    // mistake, and the reader is the one person positioned to report it.
    const broken = JSON.stringify({ schema: S, kind: "graph", data: { nodes: [{ label: "no id" }], edges: [] } });
    setup(broken);
    const banner = screen.getByTestId("file-structured-exchange-invalid");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).not.toBe("");
    expect(screen.queryByTestId("file-structured-exchange")).toBeNull();
    // …and the file is still readable as its own text underneath.
    expect(screen.getByText(/"no id"/)).toBeInTheDocument();
  });

  it("names what failed, from the reference validator when the server sent it", () => {
    // The browser's own check is a verdict without a diagnosis. The reader is the
    // one person able to tell the producer what is wrong, so what they are shown
    // is the reference validator's reasons whenever those travelled with the file.
    const broken = JSON.stringify({ schema: S, kind: "graph", data: { nodes: [{ label: "no id" }], edges: [] } });
    const file: OpenFile = {
      status: "loaded",
      path: "diagrams/broken.json",
      content: broken,
      size: broken.length,
      mtimeMs: 1000,
      documentIssues: [{ rule: "schema/required", path: "/data/nodes/0", message: "must have required property 'id'" }],
    };
    render(
      <FileViewer
        file={file}
        isStreaming={false}
        gitDiff={null}
        gitAvailable={false}
        onDirtyChange={vi.fn()}
        onFetchGitDiff={vi.fn()}
        onClearGitDiff={vi.fn()}
        onOpenGitHistory={vi.fn()}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSave={vi.fn()}
        onImageLoad={vi.fn()}
      />,
    );
    const banner = screen.getByTestId("file-structured-exchange-invalid");
    expect(banner).toHaveTextContent("must have required property 'id'");
    expect(banner).toHaveTextContent("/data/nodes/0");
  });

  it("falls back to text for a version it does not implement, without validating it", () => {
    const future = JSON.stringify({ schema: "urn:structured-exchange:2", kind: "constellation", data: {} });
    setup(future);
    expect(screen.getByTestId("file-structured-exchange-unsupported")).toHaveTextContent("urn:structured-exchange:2");
    // Not reported as invalid: it never claimed to satisfy the schema we hold.
    expect(screen.queryByTestId("file-structured-exchange-invalid")).toBeNull();
    expect(screen.queryByTestId("file-structured-exchange")).toBeNull();
    expect(screen.getByText(/constellation/)).toBeInTheDocument();
  });

  it("reports a document too large to fetch as a size problem, not as an invalid one", () => {
    const file: OpenFile = {
      status: "error",
      path: "diagrams/huge.json",
      message: "File is 6.0 MB, larger than the 1 MB preview limit (3.8 MB for structured-exchange documents)",
    };
    render(
      <FileViewer
        file={file}
        isStreaming={false}
        gitDiff={null}
        gitAvailable={false}
        onDirtyChange={vi.fn()}
        onFetchGitDiff={vi.fn()}
        onClearGitDiff={vi.fn()}
        onOpenGitHistory={vi.fn()}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSave={vi.fn()}
        onImageLoad={vi.fn()}
      />,
    );
    expect(screen.getByText(/larger than/)).toBeInTheDocument();
    expect(screen.queryByTestId("file-structured-exchange-invalid")).toBeNull();
  });

  it("leaves a markdown file alone", () => {
    setup("# Title\n\ntext", "notes/README.md");
    expect(screen.queryByTestId("file-structured-exchange")).toBeNull();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  });
});
