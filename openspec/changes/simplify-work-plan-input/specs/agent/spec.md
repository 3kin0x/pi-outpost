## MODIFIED Requirements

### Requirement: WebUIContextInjection
The server SHALL prepend a web-UI context block to the agent's system prompt at session creation, ahead of other product-owned guidance and any operator-configured `appendSystemPrompt` entries. The block SHALL describe rendering capabilities only (markdown/math/mermaid rendering, file links opening in the viewer, inline display of workspace-relative image references) and SHALL NOT grant or imply any additional permissions. Web-UI context injection SHALL be disabled when the top-level config key `webContext` is `false` (default `true`) without disabling unrelated product-owned guidance for available capabilities.

#### Scenario: DefaultInjection
- **GIVEN** a server started without a `webContext` config key
- **WHEN** the agent session is created
- **THEN** the system prompt contains the web-UI context block before other product-owned guidance and any operator `appendSystemPrompt` entries

#### Scenario: OptOut
- **GIVEN** a config with `"webContext": false`
- **WHEN** the agent session is created
- **THEN** the system prompt does not contain the web-UI context block
- **AND** unrelated product-owned guidance and operator `appendSystemPrompt` entries remain unchanged

#### Scenario: OperatorEntriesPreserved
- **GIVEN** a config with `appendSystemPrompt: ["Only discuss this project."]`
- **WHEN** the agent session is created with injection enabled
- **THEN** the operator entry is still present and unchanged after the product-owned context blocks

## ADDED Requirements

### Requirement: Product-owned Work Plan system guidance
When the Work Plan tool is available to a session, the server SHALL append concise product-owned guidance to the agent's system prompt that directs the agent to create and maintain a Work Plan for non-trivial multi-step work, read the current plan before resuming substantial work, reconcile it before declaring completion, and skip it for trivial interactions. This system fragment SHALL be the sole owner of Work Plan selection and maintenance guidance; the tool contract SHALL retain only identity and mechanical calling guidance. One shared composition path SHALL produce identical guidance for embedded and RPC runtimes, omit it when the tool is unavailable, and preserve every operator-configured system-prompt entry.

#### Scenario: Available tool receives guidance
- **GIVEN** the Work Plan tool is enabled for a session
- **WHEN** the agent session is created
- **THEN** its system prompt contains the concise Work Plan selection, maintenance, resume, and reconciliation guidance

#### Scenario: Disabled tool is not advertised
- **GIVEN** the effective tool configuration excludes the Work Plan tool
- **WHEN** the agent session is created
- **THEN** its system prompt does not instruct the agent to call that tool

#### Scenario: Embedded and RPC guidance match
- **GIVEN** equivalent embedded and RPC sessions with the Work Plan tool enabled
- **WHEN** their effective system prompts are assembled
- **THEN** both contain the same product-owned Work Plan guidance

#### Scenario: Operator prompt entries remain intact
- **GIVEN** the operator configured additional system-prompt entries
- **WHEN** Work Plan guidance is appended
- **THEN** every operator entry remains present and unchanged

#### Scenario: Behavioral guidance has one owner
- **GIVEN** the Work Plan tool is enabled for a session
- **WHEN** the effective system prompt and tool contract are assembled
- **THEN** selection, maintenance, resume, and reconciliation guidance appears in the product-owned system fragment
- **AND** the tool-owned prompt guidance does not duplicate it
