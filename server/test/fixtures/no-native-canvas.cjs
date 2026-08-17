/**
 * Preload that makes `@napi-rs/canvas` unresolvable, reproducing the single-file
 * build and any install that skipped optional dependencies.
 *
 * pdf.js reaches for the package through `createRequire`, so hiding it at
 * `Module._resolveFilename` hides it from pdf.js and from our own probe alike.
 *
 *   node --require test/fixtures/no-native-canvas.cjs …
 */
const Module = require("node:module");

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "@napi-rs/canvas" || request.startsWith("@napi-rs/canvas/")) {
    const error = new Error(`Cannot find module '${request}'`);
    error.code = "MODULE_NOT_FOUND";
    throw error;
  }
  return resolve.call(this, request, ...rest);
};
