import type {CatalogClassificationTag} from '../../../scale/library/catalog-discovery'
import {motContent} from './metadata'

/** Projection into PR356's shared discovery DTO. This does not install/persist a catalog entry.
 * Original 18-dimension cognitive keys remain intact; missing facets are explicit. */
export function motCatalogTags():CatalogClassificationTag[]{
  return [
    {id:'attention',label:'注意（任务目标）',facet:'domain'},
    {id:'dynamic_tracking',label:'动态视觉追踪',facet:'construct'},
    {id:'research',label:'认知研究',facet:'use'},
    {id:'self_exploration',label:'自我观察与探索',facet:'use'},
    {id:'learning_evaluation_support',label:'学习困难评估研究需求（待验证）',facet:'use'},
    {id:'recruitment_support',label:'企业招聘研究需求（待验证）',facet:'use'},
    {id:'recreational_exploration',label:'趣味体验（描述性）',facet:'use'},
    {id:'age_applicability:unverified',label:'年龄适用性待核',facet:'population'},
    {id:'difficulty:unverified',label:'实测难度待核',facet:'other'},
    {id:'touch',label:'触屏优先',facet:'response'},
    {id:'pointer',label:'鼠标/触控板',facet:'response'},
    {id:'keyboard',label:'键盘兼容',facet:'response'},
    {id:'language:zh-CN',label:'中文（理解验证待核）',facet:'language'},
    {id:'language:en',label:'English（comprehension validation pending）',facet:'language'},
    {id:'project_generated_geometry',label:'项目自制几何刺激',facet:'license'},
  ]
}
export const motCatalogSearchText=[motContent.name.zh,motContent.name.en,
  'attention dynamic tracking research self exploration learning recruitment recreational',
  '多目标追踪 触屏 手机 平板 桌面 10对象5目标 1/4/8°每秒 文献对照版45次 体验版9次',
  'phone tablet desktop literature-aligned research experience',
] as const
export const motCatalogIntegration = {
  persisted:false,globalSearchConnected:false,
  sharedDto:'CatalogClassificationTag',
  sharedFacetCount:9,
  retainedResearchDimensionCount:18,
  pendingFacetConsumers:['difficulty','evidence_limitations','protocol_variant','device'],
} as const
