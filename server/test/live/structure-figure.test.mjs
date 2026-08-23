/**
 * The figure tool, reached for by a real agent. LIVE: this drives real agent turns,
 * so it needs model auth configured (the same credentials `npm run dev` uses) and
 * costs tokens. Run with `npm run test:live --workspace server`.
 *
 * The mechanism is covered by unit tests; what those cannot see is whether the
 * model *uses* it, and uses it correctly. Three sessions have now produced a
 * feature that worked perfectly when driven directly and was never reached for, or
 * was reached for with the argument that makes it pointless — here, exporting the
 * whole document every time, which is a valid figure of everything and the diagram
 * nobody reads.
 *
 * So the assertions are about behaviour: that the tool was called at all, that the
 * narrowing arguments carried a kind, and that what landed on disk is this
 * application's figure rather than an SVG the model wrote by hand.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { connect, makeWorkspace, startServer } from "../harness.mjs";

const S = "urn:structured-exchange:1";

/**
 * Three kinds, so a narrowing has something to choose between, and labels distinct
 * enough that their presence in the written figure is unambiguous.
 */
const VEHICLE = {
  schema: S,
  kind: "graph",
  data: {
    nodes: [
      { id: "batt", label: "Traction battery", kind: "power" },
      { id: "inv", label: "Inverter", kind: "power" },
      { id: "motor", label: "Drive motor", kind: "power" },
      { id: "ecu", label: "Vehicle controller", kind: "compute" },
      { id: "obd", label: "Diagnostic port", kind: "diagnostic" },
    ],
    edges: [
      { from: "batt", to: "inv", label: "400V DC", kind: "power" },
      { from: "inv", to: "motor", label: "3-phase AC", kind: "power" },
      { from: "ecu", to: "inv", label: "torque request", kind: "signal" },
      { from: "obd", to: "ecu", label: "fault codes", kind: "diagnostic" },
    ],
  },
};

describe("an agent illustrating a document it is writing", () => {
  let root;
  let server;
  let client;

  /**
   * Wait for the *next* turn to end, not for any turn that already has.
   *
   * `waitFor` scans the messages already received before it waits, so a second
   * `waitFor("agent_end")` in the same session returns the first turn's — instantly,
   * before the second prompt has been answered at all. Counting past the ones already
   * seen is what makes the wait mean what it reads as.
   */
  const nextAgentEnd = async () => {
    const already = client.received.filter((message) => message.type === "agent_end").length;
    let seen = 0;
    return client.waitFor((message) => message.type === "agent_end" && ++seen > already, 180_000);
  };

  /** Every tool call the agent made this session, in order. */
  const calls = () =>
    client.received.filter((message) => message.type === "tool_start").map((message) => ({
      name: message.toolName,
      args: message.args ?? {},
    }));

  before(async () => {
    root = await makeWorkspace({ "models/vehicle.json": JSON.stringify(VEHICLE, null, 2) });
    // The bundled skill is what tells the agent this tool exists and what its two
    // hide lists mean. The harness disables skills by default, which would make this
    // a test of the tool's description alone — half of what is being checked.
    server = await startServer(root, { noSkills: false });
    client = connect(server.wsUrl());
    await client.open();
    await client.waitFor("hello");
  });

  after(async () => {
    client?.close();
    await server?.stop();
  });

  test("writes a narrowed figure and references it from the document", async () => {
    client.send({
      type: "prompt",
      text: [
        "models/vehicle.json is a structured-exchange document of a vehicle architecture.",
        "Write report.md about the power path only. It must show a figure of just the power",
        "part — leave the diagnostic elements and relationships out of that figure — and",
        "reference the figure from the Markdown.",
      ].join(" "),
    });
    await client.waitFor("agent_end", 180_000);

    const figureCalls = calls().filter((call) => call.name === "write_structure_figure");
    assert.ok(
      figureCalls.length > 0,
      `the agent never reached for the tool; it called: ${calls().map((c) => c.name).join(", ") || "nothing"}`,
    );

    // The argument that makes the tool worth having. Without it every figure is a
    // picture of everything, which is the outcome this test exists to catch.
    const narrowed = figureCalls.filter(
      (call) =>
        (call.args.hide_element_kinds ?? []).length > 0 || (call.args.hide_relationship_kinds ?? []).length > 0,
    );
    assert.ok(
      narrowed.length > 0,
      `the tool was called without any narrowing: ${JSON.stringify(figureCalls.map((c) => c.args))}`,
    );

    const written = (await readdir(path.join(root, "figures")).catch(() => [])).concat(
      await readdir(root).then((names) => names.filter((name) => name.endsWith(".svg"))),
    );
    assert.ok(written.length > 0, "no .svg reached the workspace");

    const referenced = await readFile(path.join(root, "report.md"), "utf8");
    const image = referenced.match(/!\[[^\]]*\]\(([^)]+\.svg)\)/);
    assert.ok(image, `report.md references no figure:\n${referenced}`);
    assert.ok(!image[1].startsWith("/"), `the reference is absolute and will not resolve: ${image[1]}`);

    const svg = await readFile(path.join(root, image[1]), "utf8");
    // This application's figure, not one the model drew: the serializer's own
    // shape, which a model writing SVG by hand would not reproduce.
    assert.match(svg, /^<svg /);
    assert.match(svg, /role="img"/);
    assert.ok(svg.includes("Traction battery"), "the power path is missing from its own figure");
    assert.ok(
      !svg.includes("Diagnostic port"),
      "the narrowing was named but the hidden kind is in the figure anyway",
    );
  });

  test("a second view of the same document is narrowed differently, not exported whole", async () => {
    // The failure this catches is not "the tool does not work". It is an agent that
    // reaches for it and passes the same arguments every time, so every figure is a
    // picture of everything — the diagram nobody reads, produced by a tool whose
    // whole point was to avoid it.
    const before = calls().filter((call) => call.name === "write_structure_figure").length;

    client.send({
      type: "prompt",
      text: [
        "Now add a second figure to report.md for the diagnostic path instead:",
        "the diagnostic elements and relationships, without the power ones.",
        "Write it to a different file and reference it too.",
      ].join(" "),
    });
    await nextAgentEnd();

    const second = calls().filter((call) => call.name === "write_structure_figure").slice(before);
    assert.ok(second.length > 0, "the agent did not write a second figure");

    const narrowing = (call) =>
      JSON.stringify([call.args.hide_element_kinds ?? [], call.args.hide_relationship_kinds ?? []]);
    const first = calls().filter((call) => call.name === "write_structure_figure")[0];
    assert.notEqual(
      narrowing(second[second.length - 1]),
      narrowing(first),
      "both figures were narrowed identically — the second view is the first one again",
    );

    const referenced = await readFile(path.join(root, "report.md"), "utf8");
    const images = [...referenced.matchAll(/!\[[^\]]*\]\(([^)]+\.svg)\)/g)].map((match) => match[1]);
    assert.ok(images.length >= 2, `report.md references ${images.length} figure(s):\n${referenced}`);
    assert.equal(new Set(images).size, images.length, "the two references point at the same file");

    for (const reference of images) {
      const drawn = await readFile(path.join(root, reference), "utf8");
      assert.match(drawn, /^<svg /, `${reference} is not a figure`);
    }
  });
});
