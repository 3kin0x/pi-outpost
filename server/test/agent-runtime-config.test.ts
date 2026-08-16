/**
 * `agentRuntime` configuration: defaults, validation and redaction.
 *
 * The point of these is that a misconfigured runtime stops startup with a message
 * naming the setting, rather than starting something the operator did not ask for.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
  DEFAULT_RPC_COMMAND_TIMEOUT_MS,
  DEFAULT_RPC_SHUTDOWN_GRACE_MS,
  DEFAULT_RPC_STARTUP_TIMEOUT_MS,
  loadConfig,
  redactRpcCommand,
} from "../src/config.ts";
import { RuntimeFailedError, RuntimeUnsupportedError } from "../src/agentRuntime.ts";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A config file in a throwaway directory, loaded the way the server loads it. */
async function load(raw: Record<string, unknown>) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-outpost-runtime-config-"));
  roots.push(root);
  await writeFile(path.join(root, "pi-outpost.config.json"), JSON.stringify(raw));
  return loadConfig(root, {}, { HOME: root } as NodeJS.ProcessEnv);
}

describe("agentRuntime defaults", () => {
  test("EmbeddedRemainsDefault: no runtime selection means the embedded runtime", async () => {
    const config = await load({});
    assert.equal(config.agentRuntime.mode, "embedded");
    assert.equal(config.agentRuntime.executable, undefined);
    assert.deepEqual(config.agentRuntime.args, []);
  });

  test("an empty agentRuntime block still means embedded", async () => {
    const config = await load({ agentRuntime: {} });
    assert.equal(config.agentRuntime.mode, "embedded");
  });

  test("timeouts default to the documented values", async () => {
    const config = await load({});
    assert.equal(config.agentRuntime.startupTimeoutMs, DEFAULT_RPC_STARTUP_TIMEOUT_MS);
    assert.equal(config.agentRuntime.commandTimeoutMs, DEFAULT_RPC_COMMAND_TIMEOUT_MS);
    assert.equal(config.agentRuntime.shutdownGraceMs, DEFAULT_RPC_SHUTDOWN_GRACE_MS);
  });

  test("an explicit embedded mode needs no executable", async () => {
    const config = await load({ agentRuntime: { mode: "embedded" } });
    assert.equal(config.agentRuntime.mode, "embedded");
  });
});

describe("RpcRuntimeConfigured", () => {
  test("keeps a bare executable name as a PATH lookup", async () => {
    const config = await load({ agentRuntime: { mode: "rpc", executable: "pi" } });
    assert.equal(config.agentRuntime.mode, "rpc");
    assert.equal(config.agentRuntime.executable, "pi");
  });

  test("resolves a relative executable path against the config file", async () => {
    const config = await load({ agentRuntime: { mode: "rpc", executable: "./bin/pi" } });
    assert.equal(config.agentRuntime.executable, path.join(path.dirname(config.configFile), "bin", "pi"));
  });

  test("keeps extra arguments as a vector, spaces and all", async () => {
    const config = await load({
      agentRuntime: { mode: "rpc", executable: "pi", args: ["--append-system-prompt", "be brief, and kind"] },
    });
    assert.deepEqual(config.agentRuntime.args, ["--append-system-prompt", "be brief, and kind"]);
  });

  test("accepts overridden timeouts", async () => {
    const config = await load({
      agentRuntime: { mode: "rpc", executable: "pi", startupTimeoutMs: 1000, commandTimeoutMs: 2000, shutdownGraceMs: 3000 },
    });
    assert.equal(config.agentRuntime.startupTimeoutMs, 1000);
    assert.equal(config.agentRuntime.commandTimeoutMs, 2000);
    assert.equal(config.agentRuntime.shutdownGraceMs, 3000);
  });
});

describe("InvalidRpcConfiguration", () => {
  test("an unknown mode names the setting", async () => {
    await assert.rejects(load({ agentRuntime: { mode: "grpc" } }), /"agentRuntime\.mode" must be one of embedded, rpc/);
  });

  test("an empty executable names the setting", async () => {
    await assert.rejects(
      load({ agentRuntime: { mode: "rpc", executable: "" } }),
      /"agentRuntime\.executable" must be a non-empty string/,
    );
  });

  test("rpc mode without an executable names the setting", async () => {
    await assert.rejects(load({ agentRuntime: { mode: "rpc" } }), /"agentRuntime\.executable" is required/);
  });

  test("an executable set on the embedded mode is not enough to start rpc", async () => {
    const config = await load({ agentRuntime: { executable: "pi" } });
    assert.equal(config.agentRuntime.mode, "embedded");
  });

  test("refuses a sandbox it cannot enforce on a child that builds its own tools", async () => {
    await assert.rejects(
      load({ agentRuntime: { mode: "rpc", executable: "pi" }, sandbox: { root: ".", allowWrite: false } }),
      /"sandbox" cannot be enforced when "agentRuntime\.mode" is "rpc"/,
    );
  });

  test("the same sandbox is accepted on the embedded runtime", async () => {
    const config = await load({ agentRuntime: { mode: "embedded" }, sandbox: { root: ".", allowWrite: false } });
    assert.ok(config.sandbox);
  });

  for (const arg of ["--tools", "-t", "--system-prompt"]) {
    test(`refuses "${arg}", which would override the value derived from the configuration`, async () => {
      await assert.rejects(
        load({ agentRuntime: { mode: "rpc", executable: "pi", args: [arg, "x"] } }),
        /"agentRuntime\.args" must not contain/,
      );
    });
  }

  for (const arg of ["--mode", "--mode=text", "--print", "-p", "--export", "--list-models", "--version", "-v", "--help", "-h"]) {
    test(`refuses "${arg}", which would move the child off RPC mode`, async () => {
      await assert.rejects(
        load({ agentRuntime: { mode: "rpc", executable: "pi", args: [arg] } }),
        /"agentRuntime\.args" must not contain/,
      );
    });
  }

  test("refuses --session-dir, which pi-outpost derives from agentDir", async () => {
    await assert.rejects(
      load({ agentRuntime: { mode: "rpc", executable: "pi", args: ["--session-dir", "/tmp/elsewhere"] } }),
      /"agentRuntime\.args" must not contain "--session-dir": pi-outpost derives the session directory/,
    );
  });

  test("a reserved argument is refused wherever it sits in the vector", async () => {
    await assert.rejects(
      load({ agentRuntime: { mode: "rpc", executable: "pi", args: ["--thinking", "high", "--print"] } }),
      /must not contain "--print"/,
    );
  });

  test("a non-integer timeout names the setting", async () => {
    await assert.rejects(
      load({ agentRuntime: { mode: "rpc", executable: "pi", commandTimeoutMs: 1.5 } }),
      /"agentRuntime\.commandTimeoutMs" must be a positive integer/,
    );
    await assert.rejects(
      load({ agentRuntime: { mode: "rpc", executable: "pi", startupTimeoutMs: 0 } }),
      /"agentRuntime\.startupTimeoutMs" must be a positive integer/,
    );
  });

  test("args must be strings", async () => {
    await assert.rejects(load({ agentRuntime: { mode: "rpc", executable: "pi", args: [7] } }), /"args" must be an array of strings/);
  });
});

describe("redactRpcCommand", () => {
  const base = {
    mode: "rpc" as const,
    args: [] as string[],
    startupTimeoutMs: 1,
    commandTimeoutMs: 1,
    shutdownGraceMs: 1,
  };

  test("shows the command pi-outpost will actually run, mode flag included", () => {
    assert.equal(redactRpcCommand({ ...base, executable: "/usr/bin/pi", args: ["--thinking", "high"] }), "/usr/bin/pi --thinking high --mode rpc");
  });

  test("redacts a separated --api-key value", () => {
    assert.equal(redactRpcCommand({ ...base, executable: "pi", args: ["--api-key", "sk-secret"] }), "pi --api-key <redacted> --mode rpc");
  });

  test("redacts an --api-key=value form", () => {
    assert.equal(redactRpcCommand({ ...base, executable: "pi", args: ["--api-key=sk-secret"] }), "pi --api-key=<redacted> --mode rpc");
  });

  test("redacts only the key, leaving the arguments around it readable", () => {
    assert.equal(
      redactRpcCommand({ ...base, executable: "pi", args: ["--provider", "anthropic", "--api-key", "sk-secret", "--offline"] }),
      "pi --provider anthropic --api-key <redacted> --offline --mode rpc",
    );
  });

  test("a value that merely looks like a flag is still redacted", () => {
    assert.equal(redactRpcCommand({ ...base, executable: "pi", args: ["--api-key", "--offline"] }), "pi --api-key <redacted> --mode rpc");
  });
});

describe("RuntimeUnsupportedError", () => {
  test("names the feature and the runtime so the user knows who refused", () => {
    const err = new RuntimeUnsupportedError("Storing credentials", "rpc");
    assert.equal(err.message, "Storing credentials is not available with the rpc agent runtime");
    assert.equal(err.name, "RuntimeUnsupportedError");
    assert.ok(err instanceof Error);
  });
});

describe("RuntimeFailedError", () => {
  test("carries the reason the runtime stopped", () => {
    const err = new RuntimeFailedError("the child exited with code 1");
    assert.equal(err.message, "the child exited with code 1");
    assert.equal(err.name, "RuntimeFailedError");
    assert.ok(err instanceof Error);
  });
});
