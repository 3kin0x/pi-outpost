import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

const emptyFlags = () => ({
  config: undefined,
  profile: undefined,
  cwd: undefined,
  agentDir: undefined,
  port: undefined,
  host: undefined,
});
import { parseCli, runInit, CliError, helpText } from "../src/cli.ts";

// ---------------------------------------------------------------------------
// parseCli
// ---------------------------------------------------------------------------
describe("parseCli", () => {
  test("defaults to serve with no args", () => {
    const result = parseCli([]);
    assert.equal(result.command, "serve");
    assert.deepEqual(result.flags, emptyFlags());
  });

  test("--help returns help command", () => {
    const result = parseCli(["--help"]);
    assert.equal(result.command, "help");
  });

  test("-h returns help command", () => {
    const result = parseCli(["-h"]);
    assert.equal(result.command, "help");
  });

  test("--offline sets the flag", () => {
    assert.equal(parseCli(["--offline"]).flags.offline, true);
  });

  test("without --offline the flag is absent, not false", () => {
    // Present-and-false would beat `"offline": true` in the config file.
    assert.equal("offline" in parseCli([]).flags, false);
  });

  test("--version returns version command", () => {
    const result = parseCli(["--version"]);
    assert.equal(result.command, "version");
  });

  test("-v returns version command", () => {
    const result = parseCli(["-v"]);
    assert.equal(result.command, "version");
  });

  test("init subcommand", () => {
    const result = parseCli(["init"]);
    assert.equal(result.command, "init");
    assert.equal(result.init.global, false);
    assert.equal(result.init.force, false);
  });

  test("init --global --force", () => {
    const result = parseCli(["init", "--global", "--force"]);
    assert.equal(result.command, "init");
    assert.equal(result.init.global, true);
    assert.equal(result.init.force, true);
  });

  test("config subcommand", () => {
    const result = parseCli(["config"]);
    assert.equal(result.command, "config");
  });

  test("login subcommand", () => {
    const result = parseCli(["login", "--provider", "anthropic"]);
    assert.equal(result.command, "login");
    assert.equal(result.login.provider, "anthropic");
  });

  test("login without --provider", () => {
    const result = parseCli(["login"]);
    assert.equal(result.command, "login");
    assert.equal(result.login.provider, undefined);
  });

  test("--config <path>", () => {
    const result = parseCli(["--config", "/tmp/my-config.json"]);
    assert.equal(result.flags.config, "/tmp/my-config.json");
  });

  test("--profile <name>", () => {
    const result = parseCli(["--profile", "work"]);
    assert.equal(result.flags.profile, "work");
  });

  test("--cwd <dir>", () => {
    const result = parseCli(["--cwd", "/home/project"]);
    assert.equal(result.flags.cwd, "/home/project");
  });

  test("--agent-dir <dir>", () => {
    const result = parseCli(["--agent-dir", "/custom/agent"]);
    assert.equal(result.flags.agentDir, "/custom/agent");
  });

  test("--agent-dir with windows-style path", () => {
    const result = parseCli(["--agent-dir", "D:\\pi-agent"]);
    assert.equal(result.flags.agentDir, "D:\\pi-agent");
  });

  test("--port <n>", () => {
    const result = parseCli(["--port", "8080"]);
    assert.equal(result.flags.port, 8080);
  });

  test("--host <addr>", () => {
    const result = parseCli(["--host", "0.0.0.0"]);
    assert.equal(result.flags.host, "0.0.0.0");
  });

  test("combines multiple flags with serve", () => {
    const result = parseCli([
      "--port", "9090",
      "--host", "0.0.0.0",
      "--cwd", "/workspace",
    ]);
    assert.equal(result.command, "serve");
    assert.equal(result.flags.port, 9090);
    assert.equal(result.flags.host, "0.0.0.0");
    assert.equal(result.flags.cwd, "/workspace");
  });

  test("throws CliError for invalid port (string)", () => {
    assert.throws(
      () => parseCli(["--port", "abc"]),
      CliError,
    );
  });

  test("throws CliError for out-of-range port (0)", () => {
    assert.throws(
      () => parseCli(["--port", "0"]),
      CliError,
    );
  });

  test("throws CliError for out-of-range port (70000)", () => {
    assert.throws(
      () => parseCli(["--port", "70000"]),
      CliError,
    );
  });

  test("throws CliError for an unknown command", () => {
    assert.throws(
      () => parseCli(["run"]),
      /unknown command/,
    );
  });

  test("throws CliError for an extra positional", () => {
    assert.throws(
      () => parseCli(["init", "extra"]),
      /unexpected argument/,
    );
  });

  test("throws CliError for an unknown flag", () => {
    assert.throws(
      () => parseCli(["--unknown"]),
      CliError,
    );
  });
});

// ---------------------------------------------------------------------------
// runInit
// ---------------------------------------------------------------------------
describe("runInit", () => {
  test("writes a starter config in the target directory", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "pi-cli-init-"));
    try {
      const written = runInit(tmpDir, { global: false, force: false });
      assert.ok(written.startsWith(tmpDir));
      assert.ok(written.endsWith("pi-outpost.config.json"));
      assert.ok(existsSync(written));

      const content = JSON.parse(readFileSync(written, "utf8"));
      assert.equal(content.cwd, ".");
      assert.equal(content.sandbox.allowWrite, false);
      assert.equal(content.sandbox.allowBash, false);
      assert.equal(content.server.port, 3141);
      assert.equal(content.server.host, "127.0.0.1");
      assert.equal(content.branding.title, "\u03c0");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("global init omits cwd and sandbox.root", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "pi-cli-global-"));
    const stubEnv = { XDG_CONFIG_HOME: tmpDir };
    try {
      const written = runInit(tmpDir, { global: true, force: false }, stubEnv);
      const content = JSON.parse(readFileSync(written, "utf8"));
      assert.equal(content.cwd, undefined);
      assert.equal(content.sandbox.root, undefined);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("throws when file exists without --force", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "pi-cli-exists-"));
    try {
      runInit(tmpDir, { global: false, force: false });
      assert.throws(
        () => runInit(tmpDir, { global: false, force: false }),
        /already exists/,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("--force overwrites an existing file", () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "pi-cli-force-"));
    try {
      const first = runInit(tmpDir, { global: false, force: false });
      const second = runInit(tmpDir, { global: false, force: true });
      assert.equal(first, second);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("build-exe and the browser flags", () => {
  test("the subcommand is recognised with its own options", () => {
    const parsed = parseCli(["build-exe", "--out", "./dist/pi", "--force"]);
    assert.equal(parsed.command, "build-exe");
    assert.equal(parsed.buildExe.out, "./dist/pi");
    assert.equal(parsed.buildExe.force, true);
  });

  test("help lists it", () => {
    const help = helpText();
    assert.match(help, /build-exe/);
    assert.match(help, /--out <path>/);
    assert.match(help, /--no-open/);
  });

  test("a flag belonging to another command is an error, not silence", () => {
    // Silently starting a server because --out was ignored is the worse outcome
    assert.throws(() => parseCli(["--out", "./pi"]), CliError);
    assert.throws(() => parseCli(["build-exe", "--provider", "anthropic"]), CliError);
    assert.throws(() => parseCli(["build-exe", "--global"]), CliError);
  });

  test("the two browser flags cannot both be given", () => {
    assert.throws(() => parseCli(["--open", "--no-open"]), CliError);
  });

  test("the update subcommand and --check are recognised", () => {
    const parsed = parseCli(["update", "--check"]);
    assert.equal(parsed.command, "update");
    assert.equal(parsed.update.check, true);
    assert.equal(parseCli(["update"]).update.check, false);
  });

  test("help lists update and its flag", () => {
    const help = helpText();
    assert.match(help, /pi-outpost update/);
    assert.match(help, /--check/);
  });

  test("--check outside update is an error, not silence", () => {
    // Silently starting a server because --check was ignored is the worse outcome:
    // the operator asked a question and got a running process instead of an answer.
    assert.throws(() => parseCli(["--check"]), CliError);
    assert.throws(() => parseCli(["init", "--check"]), CliError);
    assert.throws(() => parseCli(["build-exe", "--check"]), CliError);
  });

  test("neither flag leaves the decision to configuration", () => {
    assert.equal(parseCli([]).open, undefined);
    assert.equal(parseCli(["--open"]).open, true);
    assert.equal(parseCli(["--no-open"]).open, false);
  });
});
