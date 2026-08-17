/**
 * A transcript with diagrams in it, served by the scripted RPC agent.
 *
 * The browser specs need a session that already contains what they are about —
 * a Mermaid fence and a structured exchange — and no model is going to produce
 * one on demand in an offline test run. `fake-pi-rpc.mjs` answers `get_messages`
 * from a file, so the transcript is written here and simply read back.
 *
 * Everything a widget shows for these lives behind that content: the enlarge
 * overlay, its portal, and the theme the diagrams are drawn in. Without a
 * transcript the suite could only ever assert the empty state, which is how an
 * overlay that lands unstyled and off-screen inside a Shadow DOM went unnoticed.
 */

/** Wide enough that the chat column has to scroll it — which is what enlarge is for. */
export const SEEDED_MERMAID = [
  "Here is how the pieces fit together.",
  "",
  "```mermaid",
  "graph LR",
  "  browser[Browser] --> widget[Embedded widget]",
  "  widget --> ws[WebSocket]",
  "  widget --> http[HTTP branding]",
  "  ws --> server[pi-outpost server]",
  "  http --> server",
  "  server --> agent[Agent runtime]",
  "  agent --> tools[Tools]",
  "  tools --> workspace[(Workspace)]",
  "  server --> sessions[(Sessions)]",
  "```",
].join("\n");

/** A graph envelope. Edges carry `kind`: the schema requires it of anything without a `ref`. */
const ENVELOPE = {
  schema: "urn:structured-exchange:1",
  kind: "graph",
  data: {
    nodes: [
      { id: "browser", label: "Browser" },
      { id: "widget", label: "Embedded widget" },
      { id: "ws", label: "WebSocket transport" },
      { id: "http", label: "HTTP branding request" },
      { id: "server", label: "pi-outpost server" },
      { id: "agent", label: "Agent runtime" },
      { id: "tools", label: "Tool surface" },
      { id: "workspace", label: "Workspace files" },
      { id: "sessions", label: "Session store" },
    ],
    edges: [
      { from: "browser", to: "widget", kind: "flow" },
      { from: "widget", to: "ws", kind: "flow" },
      { from: "widget", to: "http", kind: "flow" },
      { from: "ws", to: "server", kind: "flow" },
      { from: "http", to: "server", kind: "flow" },
      { from: "server", to: "agent", kind: "flow" },
      { from: "agent", to: "tools", kind: "flow" },
      { from: "tools", to: "workspace", kind: "flow" },
      { from: "server", to: "sessions", kind: "flow" },
    ],
  },
};

/**
 * The same system, grouped. Containers on a graph, and on a sequence whose
 * members are deliberately interleaved — declared battery(E), ecu(C),
 * alternator(E), dash(C) — so the browser can check that the view orders the
 * columns rather than splitting a container across two headers.
 */
const GRAPH_WITH_CONTAINERS = {
  schema: "urn:structured-exchange:1",
  kind: "graph",
  data: {
    containers: [
      { id: "electrical", label: "Electrical system" },
      { id: "control", label: "Control system" },
      { id: "hydraulic", label: "Hydraulic system" },
    ],
    nodes: [
      { id: "battery", label: "Battery", container: "electrical" },
      { id: "alternator", label: "Alternator", container: "electrical" },
      { id: "ecu", label: "Engine control unit", container: "control" },
      { id: "dash", label: "Dashboard", container: "control" },
      { id: "driver", label: "Driver" },
    ],
    edges: [
      { from: "driver", to: "ecu", kind: "operates" },
      { from: "ecu", to: "battery", kind: "reads" },
      { from: "alternator", to: "battery", kind: "charges" },
      { from: "ecu", to: "dash", kind: "signals" },
    ],
  },
};

const SEQUENCE_WITH_CONTAINERS = {
  schema: "urn:structured-exchange:1",
  kind: "sequence",
  data: {
    containers: [
      { id: "electrical", label: "Electrical system" },
      { id: "control", label: "Control system" },
    ],
    participants: [
      { id: "battery", label: "Battery", container: "electrical" },
      { id: "ecu", label: "Engine control unit", container: "control" },
      { id: "alternator", label: "Alternator", container: "electrical" },
      { id: "dash", label: "Dashboard", container: "control" },
    ],
    messages: [
      { from: "ecu", to: "battery", label: "read voltage" },
      { from: "ecu", to: "alternator", label: "excite" },
      { from: "alternator", to: "battery", label: "charge" },
      { from: "ecu", to: "dash", label: "warning light" },
    ],
  },
};

export const SEEDED_MESSAGES = [
  { role: "user", content: "Draw me the architecture." },
  { role: "assistant", content: [{ type: "text", text: SEEDED_MERMAID }] },
  {
    role: "assistant",
    content: [{ type: "toolCall", id: "call-1", name: "structured_exchange", arguments: { kind: "graph" } }],
  },
  {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "structured_exchange",
    content: "graph with 9 nodes",
    // The only channel the server forwards a structured exchange from.
    details: ENVELOPE,
  },
  {
    role: "assistant",
    content: [{ type: "toolCall", id: "call-2", name: "structured_exchange", arguments: { kind: "graph" } }],
  },
  {
    role: "toolResult",
    toolCallId: "call-2",
    toolName: "structured_exchange",
    content: "graph with 5 elements in 3 containers",
    details: GRAPH_WITH_CONTAINERS,
  },
  {
    role: "assistant",
    content: [{ type: "toolCall", id: "call-3", name: "structured_exchange", arguments: { kind: "sequence" } }],
  },
  {
    role: "toolResult",
    toolCallId: "call-3",
    toolName: "structured_exchange",
    content: "sequence whose containers interleave as declared",
    details: SEQUENCE_WITH_CONTAINERS,
  },
];
