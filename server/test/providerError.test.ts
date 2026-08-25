/**
 * What a failed provider request says in the bubble the user reads.
 *
 * The reported case is verbatim: a proxy in front of the model answered with a
 * whole HTML page, and it reached the transcript with its markup intact.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeProviderError } from "@pi-outpost/shared/provider-error";

describe("describeProviderError", () => {
  it("turns the reported gateway timeout into one line", () => {
    const reported = "504 <html><body><h1>504 Gateway Time-out</h1> The server didn't respond in time. </body></html>";
    assert.equal(describeProviderError(reported), "504 Gateway Time-out The server didn't respond in time.");
  });

  it("leaves a message somebody wrote to be read exactly as it is", () => {
    // The normal case, and the one worth protecting: a provider that explains
    // itself must not be reworded, reflowed, or truncated into a summary.
    for (const message of [
      "The provider refused the request: context length exceeded",
      "rate limit reached for gpt-4o; retry in 20s",
      "Connection lost",
      "Error: read ECONNRESET",
    ]) {
      assert.equal(describeProviderError(message), message);
    }
  });

  it("keeps a status the caller prefixed, without repeating it", () => {
    assert.equal(
      describeProviderError("502 <html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>"),
      "502 Bad Gateway nginx",
    );
    // No prefix to keep: the page carries the code itself.
    assert.equal(describeProviderError("<html><body><h1>503 Service Unavailable</h1></body></html>"), "503 Service Unavailable");
  });

  it("drops markup that is not prose, and decodes what the page escaped", () => {
    const page = [
      "<!doctype html><html><head><style>body{color:red}</style>",
      "<script>location.reload()</script></head>",
      "<body><p>Upstream said &quot;too many requests&quot; &amp; closed the connection</p></body></html>",
    ].join("");
    assert.equal(describeProviderError(page), 'Upstream said "too many requests" & closed the connection');
  });

  it("bounds a page that is mostly furniture", () => {
    const long = `<html><body><p>${"the upstream server is unavailable. ".repeat(40)}</p></body></html>`;
    const described = describeProviderError(long);
    assert.ok(described.length <= 300, `bounded, got ${described.length}`);
    assert.ok(described.endsWith("…"), "says it was cut");
    assert.ok(described.startsWith("the upstream server is unavailable."));
  });

  it("returns the input untouched when there is nothing to recover", () => {
    // A page with no text at all: better the raw body than an empty bubble that
    // says an error happened and nothing else.
    const empty = "<html><body></body></html>";
    assert.equal(describeProviderError(empty), empty);
    assert.equal(describeProviderError(""), "");
    assert.equal(describeProviderError("   "), "");
  });
});
