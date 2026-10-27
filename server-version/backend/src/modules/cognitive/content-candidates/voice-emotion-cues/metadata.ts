export const voiceMetadata = {
  candidateId: 'voice-emotion-cues', status: 'CONTENT_CANDIDATE_NOT_DOT_REVIEWED_NOT_INTEGRATED',
  sourceResearchCommit: '22721e5c63dd78819e8c58921adf20157cdaa08c',
  researchTags: {
    cognitive_domain: [], target_process: [], paradigm: [], stimulus_form: [], input_upstream: [], input_proposed: ['not_frozen'],
    key_metric: ['condition_accuracy'], intended_use: ['research_protocol_selection'], code_license: [], code_rights_disposition: [],
    asset_rights_disposition: ['github_public_conditional'], asset_license_review: [], implementation_strategy: ['literature_reimplementation'],
    maturity: ['source_research_only'], evidence_limitations: ['protocol_variant_unvalidated', 'cultural_language_burden'], baseline_relation: [], research_priority: [], rule_type: ['technical_quality', 'literature_experience', 'project_provisional'],
  },
  historicalTagMeaning: 'Only existing stable vocabulary values are reused; source-stage historical fields are not overwritten with runtime claims.',
  unmappedDescriptions: ['情绪线索分类', '语音表达意图标签匹配', '原始录音NC-SA；独立自研代码', '未新增正式词条'],
  actualInputs: ['touch', 'mouse', 'pen', 'keyboard', 'assistive'], language: ['zh', 'en'], recordingLanguage: 'North American English',
  ageRange: null, difficulty: null, chineseValidation: null, deviceEquivalence: null,
  profiles: { research: 96, experience: 24 }, practice: { trials: 3, minimumMatches: 2, maxGroups: 2 },
  applicationScenes: [
    { scene: '成人声音线索研究', evidence: 'protocol-description-only' }, { scene: '自我观察', evidence: 'this-session-only' },
    { scene: '儿童语言发展研究', evidence: 'unvalidated-not-age-eligibility' }, { scene: '职业沟通研究', evidence: 'unvalidated-no-job-prediction' },
    { scene: '临床辅助研究需求', evidence: 'unvalidated-no-diagnosis' },
  ],
  backendTagsPersisted: false, globalSearchConnected: false, productActivated: false,
} as const
