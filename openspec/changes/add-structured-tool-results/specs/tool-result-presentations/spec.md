## ADDED Requirements

### Requirement: StructuredExchangePresentationsUseTheRegistry

The presentation registry SHALL select a structured-exchange presentation only for a completed tool
output whose envelope has passed schema and semantic validation. A renderer SHALL receive validated
data, never an arbitrary parsed object.

Selection SHALL participate in the existing ordered registry and its raw-output fallback. A validated
envelope is data the producer declared about itself, so it SHALL outrank every presentation that
infers a shape from the output, and SHALL NOT outrank a presentation an installed extension supplies
for its own tool.

#### Scenario: ValidEnvelopeSelectsItsPresentation
- **WHEN** a completed tool output carries a valid supported envelope
- **THEN** the registry selects that envelope's presentation and the raw output stays reachable

#### Scenario: DeclaredDataOutranksAnInferredShape
- **WHEN** a completed tool output carries a valid envelope and would also match a presentation that infers its shape from the output
- **THEN** the envelope's presentation is selected

#### Scenario: ExtensionRenderingStillWins
- **WHEN** a completed tool output carries a valid envelope for a tool whose own extension supplies a rendering
- **THEN** the extension's rendering is selected

#### Scenario: InvalidEnvelopeUsesTheNormalFallback
- **WHEN** a completed tool output carries an invalid or unsupported envelope
- **THEN** no structured presentation is selected and the registry falls back as it does for any other output
