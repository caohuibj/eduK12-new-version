# SIT-V2-D implementation summary

This PR deliberately keeps Situational V1 unchanged and places new semantics only on V2 branching SCENE nodes.

- `interactionRole` makes DECISION vs DIAGNOSTIC explicit.
- `channelPolicies` freezes requiredness and measurement role without creating mutable server round state.
- `ROUTING_ONLY` responses remain raw evidence and are removed before the existing scorer.
- `required: false` answers are accepted and retained when present, but do not block traversal or FINAL.
- `roundKey`/`stepKey` remain structural metadata; no round submit API or database state is introduced.
- runner projection exposes only presentation-safe interaction role and optionality; scoring role remains server-side.

The production Situational package registry remains V1-only. This PR enables the contract/runtime path but does not publish a new V2 content package.
