import { seededRandom, shuffleInPlace } from './prng'
import { FROZEN_LEXICAL_PSEUDOWORD_GROUPS } from './pr13LexicalBank'

export const WORDLIST_STIMULUS_SET_VERSION = 'chinese-wordlist-v1.0.0'
export const WORDLIST_NORMALIZATION_VERSION = 'wordlist-normalization-v1.0.0'

export type WordlistStage = {
  phase: 'immediate' | 'delayed'
  roundIndex: number | null
  listId: string
  words: string[]
  stimulusSetVersion: typeof WORDLIST_STIMULUS_SET_VERSION
}

const WORDLIST_BANK: Array<{ listId: string; words: string[] }> = [
  { listId: 'wordlist-01', words: ['天空', '河流', '花园', '火车', '书本', '苹果', '桥梁', '音乐', '朋友', '窗户', '森林', '太阳', '雨伞', '钟表', '山峰'] },
  { listId: 'wordlist-02', words: ['邮票', '纸张', '蜡烛', '眼镜', '香蕉', '医院', '公园', '钢琴', '杯子', '船只', '灯光', '房间', '手套', '街道', '雪花'] },
  { listId: 'wordlist-03', words: ['铅笔', '书包', '帽子', '雨衣', '桌面', '椅子', '窗帘', '石头', '树叶', '花瓶', '足球', '相机', '地图', '钥匙', '蛋糕'] },
  { listId: 'wordlist-04', words: ['月亮', '星星', '海边', '山路', '房门', '手表', '毛巾', '牙刷', '茶杯', '盘子', '风筝', '秋天', '春天', '冰箱', '窗台'] },
  { listId: 'wordlist-05', words: ['灯笼', '竹篮', '花瓣', '贝壳', '木桥', '稻田', '湖水', '围巾', '鞋子', '钱包', '信封', '蜡笔', '果汁', '饼干', '火炬'] },
]

export const wordlistStages = (seed: string, listLength: number, learningRounds: number, delayedEnabled: boolean): WordlistStage[] => {
  const list = WORDLIST_BANK[Math.floor(seededRandom(seed, 'wordlist:list')() * WORDLIST_BANK.length)]
  const words = list.words.slice(0, listLength)
  const stages: WordlistStage[] = Array.from({ length: learningRounds }, (_, roundIndex) => ({
    phase: 'immediate' as const,
    roundIndex,
    listId: list.listId,
    words: shuffleInPlace([...words], seededRandom(seed, `wordlist:round:${roundIndex}`)),
    stimulusSetVersion: WORDLIST_STIMULUS_SET_VERSION,
  }))
  if (delayedEnabled) stages.push({ phase: 'delayed', roundIndex: null, listId: list.listId, words: [...words], stimulusSetVersion: WORDLIST_STIMULUS_SET_VERSION })
  return stages
}

export type Lexicality = 'real' | 'pseudo'
export type FrequencyBand = 'high' | 'medium' | 'low'
type LexicalGroupKey = keyof typeof FROZEN_LEXICAL_PSEUDOWORD_GROUPS
export const LEXICALDECISION_STIMULUS_SET_VERSION = 'zh-lexical-v1.0.0'
export const LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION = 'zh-pseudoword-generator-v1.0.0'

export type LexicalStimulus = {
  stimulusId: string
  stimulusVersion: typeof LEXICALDECISION_STIMULUS_SET_VERSION
  lexicality: Lexicality
  wordLength: 2 | 3
  frequencyBand: FrequencyBand
  pseudowordGeneratorVersion: typeof LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION
  text: string
}

const REAL_GROUPS: Record<LexicalGroupKey, string[]> = {
  '2-high': ['人口', '时间', '工作', '生活', '学校', '家庭', '世界', '国家', '文化', '经济', '问题', '方法', '结果', '发展', '关系', '研究', '社会', '计划', '机会', '朋友', '目标', '项目', '信息', '服务', '用户', '市场', '资源', '过程', '标准', '基础'],
  '2-medium': ['天气', '颜色', '语言', '文字', '音乐', '电影', '旅行', '城市', '街道', '房间', '杯子', '苹果', '香蕉', '书包', '铅笔', '窗户', '公园', '医院', '火车', '河流', '校园', '道路', '桌子', '椅子', '衣服', '鞋子', '河岸', '湖面', '果园', '花朵'],
  '2-low': ['蜡烛', '邮票', '蚂蚁', '砾石', '竹笛', '纱窗', '绳结', '陶罐', '岩壁', '旱地', '瓦片', '纽扣', '灯笼', '芦苇', '螺丝', '柿子', '豆荚', '脊椎', '盆栽', '斑鸠', '笛声', '瓦砾', '苔藓', '竹筒', '棉布', '石砌', '木屑', '藤条', '铜壶', '砚台'],
  '3-high': ['可能会', '需要的', '已经有', '因为是', '重要的', '开始了', '发现了', '认识到', '参加了', '提供给', '进行中', '了解了', '形成了', '继续做', '使用过', '选择了', '帮助了', '完成了', '解决了', '发生了', '目标是', '项目的', '信息化', '服务于', '用户群', '市场上', '资源库', '过程性', '标准化', '基础上'],
  '3-medium': ['太阳光', '月光下', '春天里', '秋天里', '海边上', '山路上', '雨水中', '手套箱', '眼镜盒', '钢琴曲', '电视机', '照片墙', '故事书', '画面感', '书店里', '早餐店', '午餐后', '礼物盒', '花园里', '森林中', '校园内', '道路旁', '桌面上', '椅子上', '衣服架', '鞋盒子', '河岸边', '湖面上', '果园里', '花朵儿'],
  '3-low': ['斑马线', '望远镜', '纸风筝', '山谷间', '油灯芯', '石板路', '木箱子', '藤椅子', '瓷花瓶', '旧邮筒', '铜铃声', '竹篮子', '绒布袋', '雨水沟', '瓦房顶', '贝壳粉', '茶叶罐', '桥墩子', '牧羊人', '苇帘子', '碎石堆', '竹制品', '棉布袋', '木屑堆', '藤条箱', '铜壶盖', '砚台边', '石墙角', '瓦片堆', '苔藓层'],
}

const LEXICAL_GROUP_KEYS = Object.keys(REAL_GROUPS) as LexicalGroupKey[]

const groupParts = (key: LexicalGroupKey): { wordLength: 2 | 3; frequencyBand: FrequencyBand } => {
  const [length, frequencyBand] = key.split('-') as [string, FrequencyBand]
  return { wordLength: Number(length) as 2 | 3, frequencyBand }
}

const realBank: LexicalStimulus[] = (Object.keys(REAL_GROUPS) as LexicalGroupKey[]).flatMap((key) => {
  const { wordLength, frequencyBand } = groupParts(key)
  return REAL_GROUPS[key].map((text, index) => ({
    stimulusId: `zh-real-${wordLength}-${frequencyBand}-${String(index + 1).padStart(3, '0')}`,
    stimulusVersion: LEXICALDECISION_STIMULUS_SET_VERSION as typeof LEXICALDECISION_STIMULUS_SET_VERSION,
    lexicality: 'real' as const,
    wordLength,
    frequencyBand,
    pseudowordGeneratorVersion: LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION as typeof LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION,
    text,
  }))
})

const pseudoBank: LexicalStimulus[] = (Object.keys(REAL_GROUPS) as LexicalGroupKey[]).flatMap((key) => {
  const { wordLength, frequencyBand } = groupParts(key)
  return FROZEN_LEXICAL_PSEUDOWORD_GROUPS[key].map((text, index) => ({
    stimulusId: `zh-pseudo-${wordLength}-${frequencyBand}-${String(index + 1).padStart(3, '0')}`,
    stimulusVersion: LEXICALDECISION_STIMULUS_SET_VERSION as typeof LEXICALDECISION_STIMULUS_SET_VERSION,
    lexicality: 'pseudo' as const,
    wordLength,
    frequencyBand,
    pseudowordGeneratorVersion: LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION as typeof LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION,
    text,
  }))
})

export const lexicalStimulusBank = [...realBank, ...pseudoBank]

export const lexicalDecisionSequence = (seed: string, totalTrials: number): LexicalStimulus[] => {
  if (totalTrials % 2 !== 0) throw new Error('lexical decision totalTrials must be even')
  const groups = (['real', 'pseudo'] as const).reduce((acc, lexicality) => {
    acc[lexicality] = (Object.keys(REAL_GROUPS) as LexicalGroupKey[]).map((key) => shuffleInPlace(
      lexicalStimulusBank.filter((item) => item.lexicality === lexicality && `${item.wordLength}-${item.frequencyBand}` === key),
      seededRandom(seed, `lexical-bank:${lexicality}:${key}`),
    ))
    return acc
  }, {} as Record<Lexicality, LexicalStimulus[][]>)
  const cursors = { real: Array(LEXICAL_GROUP_KEYS.length).fill(0), pseudo: Array(LEXICAL_GROUP_KEYS.length).fill(0) }
  const sequence: LexicalStimulus[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const lexicality: Lexicality = index % 2 === 0 ? 'real' : 'pseudo'
    const groupIndex = Math.floor(index / 2) % LEXICAL_GROUP_KEYS.length
    const cursor = cursors[lexicality][groupIndex]
    sequence.push(groups[lexicality][groupIndex][cursor])
    cursors[lexicality][groupIndex] += 1
  }
  return sequence
}

export const EMOTIONS = ['happy', 'sad', 'angry', 'fear', 'disgust', 'surprise'] as const
export type EmotionCategory = typeof EMOTIONS[number]
export const EMOTIONRECOGNITION_STIMULUS_SET_VERSION = 'emotion-faces-ai-zh-v1.0.0'

export type EmotionStimulus = {
  stimulusId: string
  stimulusVersion: typeof EMOTIONRECOGNITION_STIMULUS_SET_VERSION
  identitySet: number
  emotion: EmotionCategory
}

const emotionBank: EmotionStimulus[] = Array.from({ length: 20 }, (_, identityIndex) => EMOTIONS.map((emotion) => ({
  stimulusId: `emotion-identity-${String(identityIndex + 1).padStart(2, '0')}-${emotion}`,
  stimulusVersion: EMOTIONRECOGNITION_STIMULUS_SET_VERSION as typeof EMOTIONRECOGNITION_STIMULUS_SET_VERSION,
  identitySet: identityIndex + 1,
  emotion,
}))).flat()

export const emotionRecognitionSequence = (seed: string, totalTrials: number, identitySetCount: number): EmotionStimulus[] => {
  const perEmotion = totalTrials / EMOTIONS.length
  const selectedIdentityCount = Math.min(identitySetCount, 20)
  const queues = EMOTIONS.reduce((acc, emotion, categoryIndex) => {
    acc[emotion] = shuffleInPlace(
      emotionBank.filter((item) => item.emotion === emotion && item.identitySet <= selectedIdentityCount),
      seededRandom(seed, `emotion:category:${categoryIndex}`),
    ).slice(0, perEmotion)
    return acc
  }, {} as Record<EmotionCategory, EmotionStimulus[]>)
  const sequence: EmotionStimulus[] = []
  for (let index = 0; index < perEmotion; index += 1) for (const emotion of EMOTIONS) sequence.push(queues[emotion][index])
  return shuffleInPlace(sequence, seededRandom(seed, 'emotion:order'))
}
