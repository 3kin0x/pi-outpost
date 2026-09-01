import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TerminalManager } from "../src/terminalManager.ts";
import type { WebSocket } from "ws";

describe("TerminalManager", () => {
  test("getDefaultShell returns a valid shell path and args", () => {
    const manager = new TerminalManager();
    const { shell, args } = manager.getDefaultShell();

    assert.ok(typeof shell === "string" && shell.length > 0);
    assert.ok(Array.isArray(args));
    if (process.platform !== "win32") {
      assert.deepEqual(args, ["-i"]);
    }
  });

  test("open, write, resize, and close terminal lifecycle", async () => {
    const manager = new TerminalManager();
    const fakeSocket = {} as WebSocket;

    let receivedData = "";
    const onData = (_id: string, data: string) => {
      receivedData += data;
    };

    let exitCodeReported: number | undefined;
    const onExit = (_id: string, code?: number) => {
      exitCodeReported = code;
    };

    const session = await manager.open(
      fakeSocket,
      "test-term-1",
      process.cwd(),
      80,
      24,
      onData,
      onExit,
    );

    assert.equal(session.terminalId, "test-term-1");
    assert.equal(session.socket, fakeSocket);
    assert.ok(session.ptyProcess);

    // Test resize
    const resized = manager.resize(fakeSocket, "test-term-1", 100, 30);
    assert.equal(resized, true);

    // Test write echo
    const wrote = manager.write(fakeSocket, "test-term-1", "echo hello-terminal-test\n");
    assert.equal(wrote, true);

    // Wait a bit for output
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(receivedData.length > 0);

    // Test getCwd
    const cwd = await manager.getCwd(fakeSocket, "test-term-1");
    assert.ok(typeof cwd === "string" && cwd.length > 0);

    // Close
    const closed = manager.close(fakeSocket, "test-term-1");
    assert.equal(closed, true);

    // Writing to closed session returns false
    const wroteAfterClose = manager.write(fakeSocket, "test-term-1", "echo after\n");
    assert.equal(wroteAfterClose, false);
  });

  test("isolates terminals strictly per socket", async () => {
    const manager = new TerminalManager();
    const socketA = { id: "a" } as unknown as WebSocket;
    const socketB = { id: "b" } as unknown as WebSocket;

    await manager.open(socketA, "term-1", process.cwd(), 80, 24, () => {}, () => {});
    await manager.open(socketB, "term-1", process.cwd(), 80, 24, () => {}, () => {});

    // Socket A cannot write to or inspect socket B's terminal, and vice-versa
    assert.equal(manager.write(socketA, "term-1", "echo a\n"), true);
    assert.equal(manager.write(socketB, "term-1", "echo b\n"), true);

    // Socket A cannot close a nonexistent or other socket's terminal
    const socketC = { id: "c" } as unknown as WebSocket;
    assert.equal(manager.write(socketC, "term-1", "hi"), false);
    assert.equal(manager.close(socketC, "term-1"), false);

    manager.closeAllForSocket(socketA);

    assert.equal(manager.write(socketA, "term-1", "hi"), false);
    assert.equal(manager.write(socketB, "term-1", "hi"), true);

    manager.closeAll();
  });
});
