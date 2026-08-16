## ADDED Requirements

### Requirement: ParseStructuredExchangeEnvelope

The utility layer SHALL parse and validate an exchange envelope from tool output without making any
rendering decision. It SHALL return either one fully validated immutable result — carrying the schema
version, kind, target when present, declared removals, and data — or no structured result at all.

It MUST NOT repair a relationship whose endpoint is missing, synthesize a label, complete a partial
document, or treat arbitrary JSON as an envelope because it resembles one.

#### Scenario: ParserReturnsOneCompleteResult
- **WHEN** tool output carries a supported and complete envelope
- **THEN** the parser returns its version, kind, target, removals, and data as a single validated result

#### Scenario: ParserDoesNotGuess
- **WHEN** tool output is JSON that resembles an envelope but does not declare a supported schema version
- **THEN** the parser returns no structured result

#### Scenario: ParserReturnsNothingForAnIncompleteDocument
- **WHEN** tool output carries an envelope that is truncated or fails validation at either stage
- **THEN** the parser returns no structured result rather than a partial one
