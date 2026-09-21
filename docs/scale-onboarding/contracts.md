# Scale onboarding PR-1 contracts

## Source identity

`ScaleInstrumentSourceV1.identity` owns `instrumentKey + instrumentVersion`. Catalog and localization bodies omit those exact fields; the registry reconstructs the legacy full manifests as read-only projections. Existing Wave files remain the temporary content facts until PR-4 migration.

Catalog-only entries are legal and explicitly marked `candidatePreview.status=CATALOG_ONLY`. Executable entries must declare `applicability` and `disclosure`; omission is a contract error rather than an unrestricted/FULL default.

## Runtime projection boundary

`instruments.generated.ts` is a checked-in, deterministic executable projection. It imports only package/scorer code. The runtime compatibility registry does not import Wave Catalog or Library read models.

The control-plane `instrument-registry.ts` combines the same executable projection with existing catalog/localization data. This direction is intentional: governance may depend on the executable projection, while runtime package lookup must not depend on governance metadata.

## Initialization order

1. Generated executable/scorer descriptors load.
2. `executable-registry.ts` rejects duplicate executable identities and duplicate active scorer descriptors, then registers reviewed local scorer functions exactly once.
3. Legacy `scale-package.registry.ts` consumes that executable view and preserves its existing public API.
4. Control-plane source registry may then combine executables with catalog/localization metadata.

No runtime `require`, filesystem discovery, remote plugin loading or global lazy registration is introduced.

## Compatibility

PR-1 keeps the six legacy executable packages visible as `PUBLISHED`, matching the old registry normalization. Four Wave-1 candidates remain non-executable. The legacy compatibility policy is explicit for known executable identities; no unknown identity is synthesized by the registry.

PR-2 owns result projection. PR-3 owns deployment authorization and actual eligibility enforcement. Merely adding a source in PR-1 cannot start a new assessment.