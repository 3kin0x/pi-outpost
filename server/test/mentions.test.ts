/**
 * The pure parsing/rewriting rule behind @-mention absolutization — see
 * mentionAbsolutization.test.mjs for the running-server proof that
 * handlePrompt and historyToItems actually use it correctly together.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mentionedPaths, rewriteMentionedPaths, rewriteMentionedPathsSync } from "@pi-outpost/shared/mentions";

describe("mentionedPaths", () => {
  test("finds a mention anywhere in the text", () => {
    assert.deepEqual(mentionedPaths("please check @src/App.tsx now"), ["src/App.tsx"]);
  });

  test("drops trailing sentence punctuation, not a path character", () => {
    assert.deepEqual(mentionedPaths("see @src/App.tsx, then @notes.md."), ["src/App.tsx", "notes.md"]);
    assert.deepEqual(mentionedPaths("@src/App.tsx.bak is the backup"), ["src/App.tsx.bak"]);
  });

  test("finds every distinct mention, duplicates included", () => {
    assert.deepEqual(mentionedPaths("@a.md and @b.md, also @a.md again"), ["a.md", "b.md", "a.md"]);
  });

  test("no mentions is an empty list, not an error", () => {
    assert.deepEqual(mentionedPaths("nothing to see here"), []);
  });
});

describe("rewriteMentionedPaths (async)", () => {
  test("replaces every occurrence of a resolved mention, leaving punctuation and the @ alone", async () => {
    const out = await rewriteMentionedPaths("see @a.md, then @a.md again — not @b.md", async (path) =>
      path === "a.md" ? "/root/a.md" : undefined,
    );
    assert.equal(out, "see @/root/a.md, then @/root/a.md again — not @b.md");
  });

  test("resolve returning the same path is a no-op, not an infinite substitution", async () => {
    const out = await rewriteMentionedPaths("@same.md", async (path) => path);
    assert.equal(out, "@same.md");
  });

  test("text with no mentions never calls resolve", async () => {
    let called = false;
    const out = await rewriteMentionedPaths("no mentions here", async () => {
      called = true;
      return "unused";
    });
    assert.equal(out, "no mentions here");
    assert.equal(called, false);
  });

  test("resolves mentions concurrently, not one at a time", async () => {
    const order: string[] = [];
    const out = await rewriteMentionedPaths("@slow.md and @fast.md", async (p) => {
      if (p === "slow.md") await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(p);
      return `/root/${p}`;
    });
    assert.equal(out, "@/root/slow.md and @/root/fast.md");
    // fast.md's resolve settles first if they ran concurrently; sequentially it
    // would always be slow.md first, whatever the delay.
    assert.deepEqual(order, ["fast.md", "slow.md"]);
  });
});

describe("rewriteMentionedPathsSync", () => {
  test("mirrors the async version's substitution rule without awaiting anything", () => {
    const out = rewriteMentionedPathsSync("read @/root/a.md please", (p) =>
      p === "/root/a.md" ? "a.md" : undefined,
    );
    assert.equal(out, "read @a.md please");
  });

  test("leaves a mention resolve does not recognise exactly as it was", () => {
    const out = rewriteMentionedPathsSync("@/elsewhere/b.md stays absolute", (p) =>
      p.startsWith("/root/") ? p.slice("/root/".length) : undefined,
    );
    assert.equal(out, "@/elsewhere/b.md stays absolute");
  });
});
