## 1. The contract

- [x] 1.1 Add `cells` to `$defs` in `shared/schemas/structured-exchange-1.json` and make a row a
      `oneOf` of the bare cells array and an object of `cells` plus an optional `role`, with `role`
      enumerated as `added` / `changed` / `context` / `removed`
- [x] 1.2 Regenerate the committed validator (`npm run build:validator`) and confirm the generated
      check rejects an unknown role and a row object without `cells`
- [x] 1.3 Add valid conformance cases: a table with roles on every row, a table with roles on some
      rows, a table with no roles at all (bare arrays, byte-identical to `table-minimal.json`)
- [x] 1.4 Add invalid conformance cases: an unknown role value, a row object with no `cells`, a row
      object whose `cells` do not align to the declared columns
- [x] 1.5 Confirm `table-with-target.json` and `table-with-removal.json` still fail — reporting roles
      must not have made a table proposable

## 2. Shared types and semantic validation

- [x] 2.1 Introduce `StructuredTableRow` in `shared/src/structuredExchange.ts` as the union, keep
      `StructuredTableCell` as it is, and widen `StructuredTableData["rows"]`
- [x] 2.2 Add one normaliser (`cellsOf` / `roleOf`, or a single `readRow`) that turns either row form
      into `{ cells, role }`, so the union is read in exactly one place
- [x] 2.3 Make the `row-column-mismatch` check in `shared/src/structuredExchangeValidation.ts` read
      through the normaliser, and keep the message naming the row index and both counts
- [x] 2.4 Unit tests: both row forms validate, a mismatched row object is rejected with the same
      message as a mismatched bare row, a table with a target is still rejected

## 3. Rendering

- [x] 3.1 Add a row-role resolver beside `elementRole` / `relationshipRole` in
      `ui/src/presentations/structuredExchange.ts`: declared role, else `context` when any row of the
      table declares one, else no role
- [x] 3.2 Tint a row in `TableView` from that resolver, reusing the element palette, and strike
      through a `removed` row so the distinction is not colour alone
- [x] 3.3 Render the role key for a table that carries roles, and render nothing extra for a table
      that carries none
- [x] 3.4 Make the key the filter, as it is for a diagram: clicking a role hides the rows declaring
      it, through the same `hidden` set and the same "Filtered view — … show everything" banner the
      envelope already renders, with keys namespaced so a role never collides with an element or
      relationship kind
- [x] 3.5 Extend `textualEquivalent` so a table's rows name their roles, with the same words the
      rendering uses
- [x] 3.6 Carry the narrowing statement into the textual equivalent — a table has no SVG export, so
      the textual equivalent is where a narrowed reading leaves this application
- [x] 3.7 Confirm the role colouring and the filter survive a column resize and the enlarged view,
      since both re-render the same component

## 4. Taking the table away

- [x] 4.1 Add `write-excel-file` to `ui` and import it dynamically, so the widget's
      bundle only pays for it when a reader actually exports
- [x] 4.2 Build the export rows once — shown rows, declared cells, and a `role` column only
      when the table declares roles — and drive both formats from that one shape
- [x] 4.3 CSV: quote a value carrying a separator, a quote or a newline; write an empty field for
      a null; download as `<kind>-<target>.csv`, named the way the SVG download already is
- [x] 4.4 XLSX: one sheet, the columns as a header row, numbers written as numbers
- [x] 4.5 Put the two controls where the SVG's are, shown only for a table, and state on the
      controls when a narrowed view means a narrowed export

## 5. Proving the scenarios

- [x] 5.1 Unit tests in `StructuredExchangeView.test.tsx`, one per scenario of
      `TableRowsMayDeclareAChangeRole` and of the narrowing requirement: four distinct roles, a
      role-less row among roles, a table with no roles unchanged, a "status" column that colours
      nothing, the key naming every role, hiding a role, and a hidden row that is absent rather than
      struck through
- [x] 5.2 Add a role-carrying requirements table to `e2e/fixtures/seeded-transcript.ts` beside the
      existing one
- [x] 5.3 Browser test in `e2e/embed.spec.ts`: the four roles are visibly distinct in the widget and
      a removed row is struck through — computed styles, not a screenshot
- [x] 5.4 Drive it in the running app (`npm run bench`) and read back the DOM: roles, key, export
- [x] 5.5 Build the scenario-to-test matrix for the delta spec and confirm no scenario is `partial`
      or `uncovered`

- [x] 5.6 Unit tests for the export: CSV quoting, a null cell, the role column present and absent,
      and a narrowed export carrying only what is shown

## 6. Landing it

- [x] 6.1 `npm run typecheck`, `npm run lint`, unit suites, `npm run test:e2e`
- [x] 6.2 `openspec validate add-table-change-roles --strict`
- [x] 6.3 Note in the release notes that a role-carrying table falls back to raw output on embed
      copies older than this change
