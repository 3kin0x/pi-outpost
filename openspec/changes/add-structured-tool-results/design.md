## Context

See proposal.md — Why. What shapes the approach:

- The application already has an output parser for a tool-declared rendering envelope
  (`ui/src/util/toolOutput.ts`) and an ordered presentation registry with a raw-output fallback
  (`ui/src/presentations/registry.ts`). Nothing in this repository *produces* that envelope; it is a
  convention external producers follow. Whatever this change defines is in the same position: the
  application is a consumer and a validator, never the authority on the data.
- The registry's order is its priority — first match wins — and a presentation already chosen while a
  call was running is not revoked when output lands, except by an extension-owned entry. A new entry
  has to state where it sits in that order and how it interacts with that rule.
- The agent's own tool results carry a `details` channel that the SDK documents as *not sent to the
  LLM*. That makes it the natural home for a payload the reader needs and the model does not — and it
  makes it the wrong home for anything the model has to reason about.
- The presentation layer's action surface is a closed union (`ui/src/presentations/types.ts`): a
  presentation names an action, it never constructs a message or invokes a tool. That boundary is
  closed by construction, and nothing here reopens it.

## Goals / Non-Goals

**Goals:**

- Make structured data authoritative for the supported views, in both directions of a round trip.
- Give a producer a small versioned envelope it can validate against before emitting.
- Make a proposal's rendering an honest approval gate: what is shown is what would be applied.
- Validate before rendering, and preserve existing provenance and inertness boundaries.

**Non-Goals:**

- Defining a domain vocabulary, a relationship taxonomy, or an integration with a specific external
  system. Relationship kinds travel as opaque strings.
- Treating diagram or markup syntax as authoritative input.
- Running producer-supplied code, renderer modules, or actions.
- Detecting a concurrent modification of the external artifact. The envelope names *which* artifact a
  proposal targets, not which revision of it. A proposal built from a stale export and applied late
  is the receiving authority's problem to detect, and this contract does not carry what it would need
  to do so. Stated as a decision rather than left as a gap.
- Reproducing an external tool's own diagram layout. What is rendered is the result of a query, not
  the arrangement a human gave it in the tool that owns it.
- Delivering an approved proposal to the authority that applies it, and reporting back what applying
  it did. That is a second contract, and defining it generically without a producer to shape it
  against would be guesswork. What is in scope is that an approved proposal survives unaltered and can
  be recovered exactly as validated — without that, no delivery mechanism could be correct anyway.

## Decisions

**The specs say what is valid; this document says where it comes from.** The envelope reaches the
client on the tool result's structured metadata channel — `result.details`, forwarded on `tool_end`.
That path is a design decision, not a requirement, and deliberately so: the environments this format
is meant for are not reachable from here, and a producer whose structured content does not reach that
channel would otherwise be blocked by the *contract* rather than by an implementation detail. If the
channel turns out not to carry it, the envelope is recovered from the result text instead — a
server-side change, with no consequence for any producer. *Alternative considered:* naming the
transport in the spec; rejected because it would bind independent producers to a detail of this
application's plumbing.

**Two audiences, two payloads, and the producer owes both.** The structured payload is for the reader
and for the renderer; it does not reach the model. Anything the agent has to reason about must
therefore also be in the result's text. This is a real obligation on producers, not an implementation
note: a producer that emits only one of the two leaves either the reader with nothing to approve or
the agent with nothing to reason about. The size caps below are what keep the second payload
affordable.

**Two identities per element, never conflated.** An element carries an identifier scoped to the
envelope, which its relationships refer to, and optionally a reference to an element the receiving
authority already holds. The first is a local name; the second is a join. Merging them would make the
envelope's internal wiring depend on the external system's identifier scheme, and would leave a new
element — which has no external identity yet — unable to be referred to at all.

**The patch rule applies at every level, not just to elements.** A field the proposal does not
declare is untouched, exactly as an element it does not mention is untouched. The alternative —
reading a referenced element as a full replacement of its remote counterpart — would force a producer
to restate every field it does not intend to change, and a producer that restates fields is one that
will eventually restate one of them wrongly. That is the same failure that makes an omitted element
unsafe to read as a removal, so it gets the same answer. *Consequence worth naming:* an element that
carries a reference and nothing else declares no change at all — it is context, named so a
relationship can attach to it, and the approval view must not show it as modified. In version 1 an
element carries only a label, so the distinction is not yet observable; fixing the rule now is what
keeps a later version from having to invent one.

**A relationship's endpoints are identity, and that is the one exception to the field rule.** They
are declared on every relationship, referenced or not. *Alternative considered:* letting them follow
the field rule like everything else, so a label-only patch could omit them; rejected because the
approval view then has a relationship it cannot place — it knows something changed but not where —
and the reader would be approving a structural change from a line of prose. The exception is also
the safer half of the trade: an endpoint restated wrongly is an inconsistency the receiving authority
can detect against what it holds, whereas a label restated wrongly is silently applied. Re-attaching
is therefore a removal and a creation, which is what it is anyway in most authorities.

**Two levels of bound: a ceiling in the contract, a limit in the deployment.** The schema's bounds are
a ceiling, stable for the life of a version, and are what a producer may assume is accepted anywhere
that version is supported. A deployment may apply a stricter operational limit, so numbers can be
calibrated against real traffic — which is where they will actually be learned — without changing the
published contract or forcing a version bump. *Alternative considered:* one configurable set of
bounds; rejected because a producer validating against the published schema would pass locally and be
refused remotely, which is precisely the failure a published contract exists to prevent. The refusal
therefore says which level it came from, and accepted sizes are recorded so a limit can be set from
evidence rather than from the first thing that broke.

**A reference is qualified by what it names.** References are the external authority's identifiers
and nothing here can promise they are unique across elements and relationships. So anything naming a
reference — a removal, today — says what kind of thing it means. *Alternative considered:* requiring
references to be globally unique; rejected because it is a constraint on someone else's identifier
scheme, which this contract is in no position to impose.

**A proposal is a patch, and omission means nothing.** An envelope that names a target describes only
what changes. An element it does not mention is untouched; a removal is declared explicitly. The
alternative — treating the envelope as the complete new state, so an omission deletes — is unsafe
here for a specific reason: one of the expected producers is the agent, and a generated document that
silently drops elements is a normal failure mode. Under complete-state semantics that failure deletes
them, and the approval view cannot catch it, because a rendering shows what is present and cannot
show what is absent.

**The proposal is its own diff.** Because a patch carries only what changes, the approval view has
nothing to compute: it renders the envelope. What the reader approves is exactly what would be
applied. *Alternative considered:* rendering the resulting state and computing a comparison against
the previous one; rejected because it requires the application to hold both versions and to model
what "applying" means — knowledge that belongs to the receiving authority.

**A target names an artifact, not a revision.** A present target makes the envelope a patch of that
artifact; an absent one makes it a complete new artifact. The mode is declared, never inferred from
whether references happen to be present — a patch that only adds elements has no references anywhere,
and inferring from that would read the most ordinary kind of proposal as a request to start over.

**A normative JSON Schema plus semantic validation.** The contract ships as a versioned JSON Schema
and is the source of truth for shape, required fields, closed objects, size limits, and the per-kind
alternatives. The parser validates against it, then performs the relational checks JSON Schema cannot
express: unique identifiers, relationship endpoints resolving to declared elements, row-to-column
alignment, agreement between the declared kind and the data variant, and the rule that only
round-trippable kinds may carry a target or removals. *Alternative considered:* types only; rejected
because they give an independent producer nothing executable.

**Only some kinds make the round trip.** A graph and a sequence describe things a producer can be
asked to change. A table is a derived view — a projection over something else — so it may be
returned, rendered and reasoned about, but never proposed. It carries no target and no removals, and
that is enforced rather than left to convention.

**Relationship kinds are required and opaque.** Every relationship declares a kind. The schema does
not enumerate the possible values and the renderer does not interpret them: it may show them and use
them to distinguish otherwise identical relationships, nothing more. Required, because a proposal
that asks for an untyped relationship cannot be applied by anything; opaque, because the vocabulary
belongs to the producer's domain and enumerating it here would make this contract domain-specific.

**Hard caps, refused rather than degraded.** Every collection *and every string* is bounded in the
schema, and the document's total size is bounded before it is parsed — a check the schema cannot
express, and the one that has to run first, since the others require the document to exist in memory
to be applied at all. Exceeding a bound is a validation failure with a diagnostic, not a truncated
rendering. The bound has two jobs:
keeping a rendering legible, and keeping the companion text payload affordable. A producer that
exceeds it asked too broad a question, and a diagnostic saying so is more useful than a view that
silently shows part of an answer.

**All-or-nothing validation, and a legible refusal.** A malformed envelope produces no specialized
view; the raw output survives unchanged. This matters more with a generative producer than with a
hand-written one: the agent can be told what was wrong and try again, which makes a clean refusal
part of the loop rather than a dead end. *Alternative considered:* rendering the valid subset;
rejected because a partial graph looks complete, and here it would be a partial *proposal* that a
human might approve.

**One reference validator, shared by the application and by producers.** The schema validator and the
semantic validator are the same code behind a stable command-line interface that reads a document
from a file or standard input and emits machine-readable diagnostics with a non-zero status on
failure. It serves three callers: an independent producer written in another language, the agent
checking its own proposal before presenting it, and the application. No producer-side success
exempts the application from validating on receipt. The interface and the schema file must be
copyable on their own, since the producers that need them are not necessarily built in this
repository.

**Data produces diagram syntax; syntax never produces data.** A derived diagram export is offered for
a validated graph or sequence, deterministically, and labelled as derived. It is not conditional:
being able to get portable diagram syntax *out* is part of why structured data is worth carrying
*in*. Diagram source is never parsed to create, repair, or augment the authoritative data.

**Producer text stays inert.** Labels and values are rendered as text through the existing inert
output policies. No producer-supplied markup is injected, and the closed action union is not
extended by this change.

## Risks / Trade-offs

- The first schema may be too broad or too narrow → keep it to the primitives the round trip needs
  and version additions, rather than adding optional fields with ambiguous semantics.
- A generative producer emits plausible but invalid documents → the reference validator is in the
  producing loop, and refusal is legible enough to correct.
- Rich labels can carry hostile content → render every value as text and reuse existing inert-output
  policies.
- Dense structures are hard to lay out → bounded by the caps, with a deterministic layout that
  implies no meaning in geometry, and the textual equivalent always available.
- The contract can only be exercised here against producers built here → the agent is a real producer,
  not a stub, so the round trip is testable without the environments this is ultimately aimed at.
  What it cannot prove is that the shape is cheap for an independent producer to emit.
- JSON Schema cannot express every cross-field rule → a small deterministic semantic validator runs
  after it, and neither stage may repair invalid data.

## Migration Plan

Existing tool outputs and presentations are unchanged. Producers opt in by emitting a supported
envelope. Removing the renderers leaves the original results reachable through the existing fallback.
A later incompatible version adds a schema file and a renderer path beside the current one, leaving
previously recorded results valid.

## Open Questions

- Whether a later version should carry a revision alongside the target, making concurrent
  modification detectable. Additive, and deliberately out of scope here.
- Whether relationship kinds deserve an optional producer-declared legend, so a reader sees what a
  kind means without the renderer interpreting it.
