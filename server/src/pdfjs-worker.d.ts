/**
 * `pdfjs-dist` ships a `.d.mts` for `legacy/build/pdf.mjs` but not for its
 * sibling `pdf.worker.mjs` — that file is meant to be handed to a real Worker
 * or a bundler, not imported as an API. `pdf.ts` imports it anyway, to publish
 * it on `globalThis.pdfjsWorker` and preempt pdf.js's own dynamic import of it
 * (see `loadPdfjs` for why). This is the minimal shape that import needs.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
