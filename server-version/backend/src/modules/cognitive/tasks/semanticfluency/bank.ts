/**
 * Internal DRAFT Chinese category-fluency banks (semanticfluency-zh-v1.0.0).
 * Original word lists authored for this pilot; common basic-level examples,
 * not copied from any published fluency norm.
 */
export const SEMANTICFLUENCY_STIMULUS_SET_VERSION = 'semanticfluency-zh-v1.0.0'

export const SEMANTICFLUENCY_CATEGORIES = ['animals', 'fruits'] as const
export type SemanticfluencyCategory = (typeof SEMANTICFLUENCY_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<SemanticfluencyCategory, string> = {
  animals: '动物',
  fruits: '水果',
}

export const SEMANTICFLUENCY_BANKS: Record<SemanticfluencyCategory, string[]> = {
  animals: [
    '猫', '狗', '猪', '牛', '羊', '马', '驴', '兔子', '老鼠', '松鼠', '刺猬', '狐狸', '狼', '豹子', '老虎', '狮子', '大象', '猴子', '猩猩', '长颈鹿', '斑马', '河马', '犀牛', '骆驼', '梅花鹿', '熊猫', '熊', '北极熊', '袋鼠', '考拉', '蝙蝠',
    '鸡', '鸭', '鹅', '鸽子', '麻雀', '燕子', '乌鸦', '猫头鹰', '老鹰', '鹦鹉', '孔雀', '企鹅', '鸵鸟', '天鹅', '大雁', '喜鹊', '啄木鸟', '海鸥', '丹顶鹤',
    '蛇', '蜥蜴', '壁虎', '乌龟', '鳄鱼', '青蛙', '蟾蜍', '蝾螈',
    '金鱼', '鲤鱼', '鲨鱼', '鲸鱼', '海豚', '海豹', '海象', '章鱼', '乌贼', '螃蟹', '虾',
    '蜜蜂', '蝴蝶', '蜻蜓', '蚂蚁', '蟋蟀', '螳螂', '瓢虫', '苍蝇', '蚊子', '蟑螂', '蝗虫', '萤火虫', '蝉', '毛毛虫', '蜘蛛', '蜗牛',
  ],
  fruits: [
    '苹果', '梨', '桃子', '李子', '杏', '樱桃', '枣', '葡萄', '提子', '柿子', '石榴', '橘子', '橙子', '柚子', '柠檬', '金桔', '柚', '佛手',
    '香蕉', '菠萝', '芒果', '荔枝', '龙眼', '木瓜', '椰子', '火龙果', '榴莲', '山竹', '红毛丹', '枇杷', '杨梅', '杨桃', '莲雾', '百香果', '牛油果', '菠萝蜜',
    '西瓜', '哈密瓜', '香瓜', '甜瓜',
    '草莓', '蓝莓', '树莓', '黑莓', '猕猴桃', '奇异果', '无花果', '桑葚', '甘蔗', '荸荠', '菱角',
    '板栗', '核桃', '腰果', '开心果', '榛子', '松子', '银杏果',
  ],
}

import { cognitiveBankMetaSchema, type CognitiveBankMeta } from '../../banks/bank-meta'

/** PR1 题库元数据：来源/授权/等值身份；对外发布闸门见 publish-cognitive-configs。 */
export const bankMeta: CognitiveBankMeta = cognitiveBankMetaSchema.parse({
  stimulusSetVersion: 'semanticfluency-zh-v1.0.0',
  source: 'internal-authored (pilot bank, not copied from any published test)',
  license: 'internal-generated',
  itemSetRole: 'form',
})
