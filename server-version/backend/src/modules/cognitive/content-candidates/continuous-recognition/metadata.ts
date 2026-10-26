/** Research metadata only. Not a second platform domain registry or searchable persisted catalog. */
export const RECOGNITION_METADATA = {
  candidateId: 'continuous-recognition', status: 'DESIGN_PROPOSAL',
  name: { zh: '连续图像再认', en: 'Continuous image recognition' },
  languages: ['zh', 'en'], ages: null,
  upstreamResearchCommit: '22721e5c63dd78819e8c58921adf20157cdaa08c',
  upstreamProtocolCommit: 'b4ad68e5376ee7256763abb622cf06470514edf5',
  inheritedResearchTags: {
  "cognitive_domain": [
    "recognition_memory"
  ],
  "target_process": [
    "repeat_recognition"
  ],
  "paradigm": [
    "continuous_old_new"
  ],
  "stimulus_form": [
    "image_stream"
  ],
  "input_upstream": [
    "r_key_detection"
  ],
  "input_proposed": [
    "not_frozen"
  ],
  "key_metric": [
    "recognition_hit_false_alarm",
    "corrected_recognition"
  ],
  "intended_use": [
    "research_protocol_selection"
  ],
  "code_license": [
    "mit_recorded"
  ],
  "code_rights_disposition": [
    "github_public_conditional"
  ],
  "asset_rights_disposition": [
    "authorization_pending"
  ],
  "asset_license_review": [
    "omi_nc_sa_project_unconfirmed"
  ],
  "implementation_strategy": [
    "code_adaptation"
  ],
  "maturity": [
    "source_research_only"
  ],
  "evidence_limitations": [
    "timing_device_unverified",
    "personal_scoring_redefinition",
    "protocol_version_decision"
  ],
  "baseline_relation": [
    "new_family_candidate"
  ],
  "research_priority": [
    "priority_finalize"
  ],
  "rule_type": [
    "technical_quality",
    "theoretical_reference",
    "literature_experience",
    "project_provisional"
  ]
},
  proposedExtensions: {
    cognitiveDomain: { value: 'memory', evidence: 'target-process-only' },
    applicationScenes: [
      { value: 'self-observation', validation: 'unvalidated-descriptive-use' },
      { value: 'research', validation: 'protocol-and-population-review-required' },
      { value: 'learning-support', validation: 'unvalidated-no-diagnosis' },
      { value: 'recruitment-support', validation: 'unvalidated-no-selection-prediction' }
    ],
    difficulty: { value: null, validation: 'unverified' },
    devices: ['phone', 'tablet', 'desktop'], inputs: ['touch', 'mouse', 'keyboard'],
    deviceEquivalence: 'unverified'
  },
  assetStatus: 'NO_FORMAL_LICENSED_ASSET_BANK',
  sourceCodeLicense: 'MIT', exampleImageLicense: 'CC-BY-NC-SA-4.0; NOT imported',
  implementationRoute: 'independent-logical-implementation',
  protocolApproval: 'User approved three previews and 260/100 profile count proposals; assets/timing/validity not approved',
  registration: false
} as const
