/** Research metadata is not a backend taxonomy import or efficacy claim. */
export const antContent = {
  "candidateId": "attention-ant-pebl",
  "status": "UNREGISTERED_PURE_LOGIC_CANDIDATE",
  "names": {
    "zh": "线索与箭头注意任务",
    "en": "Cue and Arrow Attention Task"
  },
  "familyRelationship": "protocol_variant_of_flanker_neighbour_not_new_family",
  "inheritedResearchTags": {
    "cognitive_domain": [
      "attention",
      "executive_control"
    ],
    "target_process": [
      "alerting",
      "spatial_orienting",
      "conflict_processing"
    ],
    "paradigm": [
      "ant_pant_cue_flanker"
    ],
    "stimulus_form": [
      "geometric_arrows_cues"
    ],
    "input_upstream": [
      "auto_layout_keys_or_mouse"
    ],
    "input_proposed": [
      "keyboard_plan_not_frozen"
    ],
    "key_metric": [
      "condition_accuracy",
      "condition_rt",
      "cue_conflict_rt_differences"
    ],
    "intended_use": [
      "research_protocol_selection"
    ],
    "code_license": [
      "gpl_2_0_recorded"
    ],
    "code_rights_disposition": [
      "github_public_conditional"
    ],
    "asset_rights_disposition": [
      "authorization_pending"
    ],
    "asset_license_review": [
      "fonts_ui_unverified"
    ],
    "implementation_strategy": [
      "literature_reimplementation"
    ],
    "maturity": [
      "source_research_only"
    ],
    "evidence_limitations": [
      "timing_device_unverified",
      "protocol_variant_unvalidated",
      "static_runtime_risk",
      "protocol_version_decision"
    ],
    "baseline_relation": [
      "protocol_variant"
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
  "historicalTagsNote": "原18维来源研究标签原样保留，不当作当前开发成熟度或实际输入真值。",
  "implementationTags": {
    "input": [
      "touch",
      "pointer",
      "keyboard"
    ],
    "languages": [
      "zh",
      "en"
    ],
    "ageRange": null,
    "ageEvidence": "unverified",
    "difficulty": "same single-trial task in both profiles; familiarity and duration differ",
    "devices": [
      "phone",
      "tablet",
      "desktop"
    ],
    "priority": "phone_tablet_touch_first",
    "scenarios": [
      {
        "key": "self_exploration",
        "evidence": "unverified",
        "restriction": "只描述本轮记录，不输出能力等级"
      },
      {
        "key": "learning_assessment_support",
        "evidence": "unverified",
        "restriction": "无学习困难诊断效度证据"
      },
      {
        "key": "recruitment_research",
        "evidence": "unverified",
        "restriction": "无录用预测效度证据，不作录用结论"
      },
      {
        "key": "research_protocol_pilot",
        "evidence": "unverified",
        "restriction": "协议变式，需实机与人群研究"
      }
    ]
  },
  "licensing": {
    "upstreamCode": "PEBL GPL-2.0; not copied into this implementation",
    "route": "literature_reimplementation_with_independent_geometry_and_text",
    "projectCodeLicense": "follows repository policy; no new MIT grant asserted",
    "assets": "No external faces/fonts/audio/stimulus files imported. Future fonts and rendered geometry need separate review.",
    "rightsDisposition": "candidate_code_independent; external_assets_not_imported; attribution_review_pending"
  },
  "sourceEvidence": [
    {
      "repository": "caohuibj/eduK12-new-version",
      "commit": "22721e5c63dd78819e8c58921adf20157cdaa08c",
      "file": "docs/cognitive-library/task-selection-20261026/attention-task-cards.json",
      "pointer": "/cards/0"
    },
    {
      "repository": "stmueller/pebl",
      "commit": "eb22a0725d765a0597a4905920ad3c603b1c9ae8",
      "file": "battery/ANT/ANT.pbl",
      "version": "gPANTVersion 1.2; not schema 1.1"
    },
    {
      "repository": "stmueller/pebl",
      "commit": "eb22a0725d765a0597a4905920ad3c603b1c9ae8",
      "file": "battery/ANT/params/ANT.pbl.schema.json",
      "blob": "d7cce1e0985e3262d445452eb2e691c3b2a2768e"
    },
    {
      "citation": "Fan et al. (2002), Testing the Efficiency and Independence of Attentional Networks",
      "url": "https://raz-lab.org/wp-content/uploads/2023/09/089892902317361886.pdf",
      "readStatus": "prior fixed research card; this design does not claim a new full-paper read"
    }
  ],
  "decisionsPending": [
    "中性默认无侧翼遵循已审PEBL1.2；横杠变式有独立配置/hash，未由截图审批替代最终选型。",
    "触控区、几何与屏幕/视角标定、实际刷新和指导语理解，须在正式runner阶段验证。",
    "20ms为新登记的项目暂定技术规则，无实机或效度证据；试行前复核。",
    "48次短版每条件1次，保持完整条件但不支持稳定网络能力推断。"
  ],
  "catalogIntegration": {
    "persisted": false,
    "searchConsumerConnected": false,
    "registration": false
  },
  "copy": {
    "zh": {
      "instruction": "请注视中央，判断中间箭头朝向，点击固定左/右回应区。忽略两侧箭头。",
      "reportTitle": "这次的线索与箭头记录",
      "limitation": "这里只描述本轮记录，不代表日常注意能力。"
    },
    "en": {
      "instruction": "Look at the center. Choose the direction of the middle arrow using the fixed left/right response areas. Ignore the flankers.",
      "reportTitle": "Your cue and arrow session",
      "limitation": "These records describe this session, not your everyday attention ability."
    }
  },
  "copyStatus": "bilingual_authored_unvalidated; not a validated translation"
} as const
