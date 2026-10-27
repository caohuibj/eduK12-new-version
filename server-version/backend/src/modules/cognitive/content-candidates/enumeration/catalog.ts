import type { CatalogClassificationTag } from '../../../scale/library/catalog-discovery'
import { enumerationRecipeContent } from './metadata'

/** Content-only projection for the complete-recipe candidate; it does not persist or enable a catalog row. */
export function enumerationCatalogTags(): CatalogClassificationTag[] {
  return [
    { id: 'attention', label: '注意（任务目标）', facet: 'domain' },
    { id: 'brief_numerosity_report', label: '短时数量报告', facet: 'construct' },
    { id: 'masked_enumeration_5_9', label: '掩蔽后5–9点数报告', facet: 'other' },
    { id: 'numerosity_accuracy_error', label: '数量正确率与误差', facet: 'other' },
    { id: 'research', label: '认知研究', facet: 'use' },
    { id: 'self_exploration', label: '自我观察与探索', facet: 'use' },
    { id: 'learning_evaluation_support', label: '学习相关评估研究（待验证，非诊断）', facet: 'use' },
    { id: 'recruitment_support', label: '招聘相关研究（待验证，非选拔预测）', facet: 'use' },
    { id: 'age_applicability:unverified', label: '年龄适用性未核', facet: 'population' },
    { id: 'difficulty:unverified', label: '实测难度未核；点数范围5–9', facet: 'other' },
    { id: 'touch', label: '触屏优先（设备等值未核）', facet: 'response' },
    { id: 'pointer', label: '鼠标/触控板', facet: 'response' },
    { id: 'keyboard', label: '键盘兼容', facet: 'response' },
    { id: 'language:zh-CN', label: '中文内容（理解验证未核）', facet: 'language' },
    { id: 'language:en', label: 'English content（产品入口与理解验证未核）', facet: 'language' },
    { id: 'project_generated_geometry', label: '项目自制点阵与掩蔽', facet: 'license' },
  ]
}
export const enumerationCatalogSearchText = [enumerationRecipeContent.name.zh, enumerationRecipeContent.name.en,
  '点数判断 注意 短时数量 滑杆 确认 手机 平板 桌面 文献对照版100次 体验版25次',
  'attention enumeration numerosity slider confirm research experience learning recruitment phone tablet desktop',
] as const
export const enumerationCatalogIntegration = {
  identity: enumerationRecipeContent.versionBindings,
  persisted: false, globalSearchConnected: false, sharedDto: 'CatalogClassificationTag',
  retainedResearchDimensionCount: 18,
  pendingFacetConsumers: ['difficulty', 'evidence_limitations', 'protocol_variant', 'device'],
} as const
