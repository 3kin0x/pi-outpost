import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

test("EveryReleaseCarriesThem: a missing GitHub Release is created before assets are uploaded", () => {
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"), workflow.indexOf("\n  attach:"));
  const attachJob = workflow.slice(workflow.indexOf("\n  attach:"));
  const view = attachJob.indexOf('gh release view "$GITHUB_REF_NAME"');
  const create = attachJob.indexOf('gh release create "$GITHUB_REF_NAME"');
  const upload = attachJob.indexOf('gh release upload "$GITHUB_REF_NAME"');

  assert.ok(view >= 0, "the attach job must check whether the GitHub Release exists");
  assert.ok(create > view, "a missing GitHub Release must be created after the check");
  assert.ok(upload > create, "assets must be uploaded after the GitHub Release exists");
  assert.match(publishJob, /matched=""[\s\S]+matched="\$matched \$pkg"/);
  assert.match(publishJob, /if \[ -z "\$matched" \]; then[\s\S]+exit 1/);
  assert.doesNotMatch(
    publishJob,
    /if \[ -z "\$publish" \]; then[\s\S]+exit 1/,
    "an npm-complete rerun must continue to the release repair job",
  );
  assert.match(attachJob, /if ! gh release view[\s\S]+then[\s\S]+gh release create/);
  assert.match(attachJob, /gh release upload[^\n]+--clobber/);
});
