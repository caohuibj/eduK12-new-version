import inquiryPlaceholder from './contact-inquiry-placeholder.svg'
import cooperationPlaceholder from './contact-cooperation-placeholder.svg'

// Replace only imageSrc and status after both real contact images are confirmed.
// Keep placeholder status until the image is an approved, usable contact channel.
export const schoolContactCards: { id: string; title: string; imageSrc: string; status: 'placeholder' | 'confirmed'; description: string }[] = [
  { id: 'inquiry', title: '项目咨询', imageSrc: inquiryPlaceholder, status: 'placeholder', description: '交流学校需要，了解项目方向。' },
  { id: 'cooperation', title: '合作联系', imageSrc: cooperationPlaceholder, status: 'placeholder', description: '讨论合作方式与校内准备。' },
]

export const schoolCooperationPolicy = {
  status: '拟议 · 待正式批准',
  intro: '以下为合作条件的拟议框架，尚不是已生效的招募简章。具体安排须以正式批准的合作文件为准。',
  items: [
    { title: '适合怎样的学校', text: '希望改善学生成长支持体系的中小学校，以及具备适当实施条件的教育合作单位。' },
    { title: '共同认可的原则', text: '学生利益优先，尊重知情参与与隐私保护，以科学评估和持续改进支持教育实践。' },
    { title: '合作方向与形式', text: '可讨论专题合作、研究协作或整校支持；范围与服务内容由双方共同确认。' },
    { title: '学校的参与准备', text: '指定项目协调人员，建立校内沟通、专业支持和安全责任机制。' },
    { title: '研究与测评的前提', text: '涉及未成年人数据时，须先完成适用的伦理审查、知情同意、授权及安全准入。' },
    { title: '尚待正式确定的安排', text: '服务范围、费用或资助、资源配额、招募批次、名额与时间均待正式批准后公布。' },
  ],
}

export const schoolResearchReferences = [
  { title: 'SEL 与校园成长环境', label: '研究综述', citation: 'Cipriano 等（2023）· Child Development, 94, 1181–1204',
    text: '学校 SEL 干预的元分析为社会情绪能力、关系与学习环境的支持提供领域依据；实际效果会随情境和实施方式变化。',
    limit: '领域研究结果不能直接推断本平台或某所学校的成效。', url: 'https://doi.org/10.1111/cdev.13968', link: '查看论文与 DOI' },
  { title: 'ACT 与青少年成长支持', label: '专业方法', citation: 'Hayes 与 Ciarrochi（2015）· The Thriving Adolescent',
    text: '以 ACT 与积极心理学为基础的青少年实践方法，关注觉察、价值、行动以及日常关系，为理解成长支持提供方法参考。',
    limit: '专业方法著作不是 Huischool 效果验证，也不构成治疗承诺。', url: 'https://www.newharbinger.com/9781608828036/the-thriving-adolescent/', link: '查看原著与出版信息' },
  { title: '整校支持与持续改进', label: '实践指南', citation: 'CASEL · Guide to Schoolwide SEL, Focus Area 4',
    text: '以计划、实践、观察与调整的持续改进过程，把成长支持融入学校文化、成人支持及家庭社区合作。',
    limit: '指南用于解释工作方向，不代表 CASEL 对本平台的认证或合作。', url: 'https://schoolguide.casel.org/focus-area-4/continuously-improve-schoolwide-sel-implementation/', link: '查看 CASEL 原始指南' },
]
