## ADDED Requirements

### Requirement: ThinkingLevelDeclaration

The configuration SHALL support declaring which thinking levels a model accepts, for a
deployment whose model the runtime cannot describe. Each entry SHALL name a provider, MAY
name a model id, and SHALL list the accepted levels. An entry without an id SHALL apply to
every model of that provider — an in-house endpoint serving several models should not have
to be enumerated to say the one thing true of all of them.

Where two entries could apply, the one naming the model id SHALL win over the
provider-wide one: the more specific statement is the more deliberate.

A declaration SHALL be authoritative over whatever the runtime reports for that model. The
setting exists precisely because the runtime is guessing, and a guess that overrode the
operator would leave them no way to state what they know.

The listed levels SHALL be normalised the way a runtime-reported list is — unknown names
refused, canonical order imposed, `off` always available — and an entry that names no usable
level SHALL fail startup, since a model that accepts nothing at all cannot be asked for
anything.

An entry that is not an object, names no provider, or lists an unknown level SHALL make
startup fail with an error naming the setting and the offending entry.

#### Scenario: DeclaringOneModel
- **GIVEN** a configuration declaring that one provider's model accepts only `off`
- **WHEN** the server starts and that model is current
- **THEN** the accepted levels reported for it are `off` alone

#### Scenario: DeclaringAWholeProvider
- **GIVEN** a configuration entry naming a provider and no model id
- **WHEN** any model of that provider is current
- **THEN** the declared levels apply to it

#### Scenario: TheMoreSpecificEntryWins
- **GIVEN** a provider-wide entry and an entry for one model of that provider
- **WHEN** that model is current
- **THEN** the model's own entry applies

#### Scenario: ADeclarationBeatsTheRuntime
- **GIVEN** a runtime reporting a set for a model the configuration also declares
- **WHEN** the accepted levels are reported
- **THEN** the declared set is used

#### Scenario: UnknownLevelName
- **GIVEN** a configuration entry listing a level that is not a known thinking level
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming the setting and the entry

#### Scenario: AnEntryThatAcceptsNothing
- **GIVEN** a configuration entry whose level list is empty, or holds only unknown names
- **WHEN** the configuration is loaded
- **THEN** startup fails with an error naming the setting and the entry

#### Scenario: UnsetLeavesTheRuntimeInCharge
- **GIVEN** a configuration declaring nothing
- **WHEN** the accepted levels are reported
- **THEN** they come from the runtime exactly as before
