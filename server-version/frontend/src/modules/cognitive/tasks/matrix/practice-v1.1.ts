import type {MatrixItemSpec} from '../shared/prng'

export const MATRIX_PRACTICE_SET_V11='matrix-practice-v1.1.0' as const
/** Original teaching matrices, with panels distinct from the formal bank; glyph vocabulary is unchanged. */
export const MATRIX_PRACTICE_V11:MatrixItemSpec[]=[
 {itemId:'matrix-practice-01',ruleFamily:'progression',difficulty:1,panels:[2,3,4,4,5,6,6,7],options:[8,3,5,1],correctOption:0,stimulusSetVersion:'matrix-generator-v1.0.0'},
 {itemId:'matrix-practice-02',ruleFamily:'alternation',difficulty:1,panels:[3,7,3,5,2,5,7,4],options:[2,7,5,8],correctOption:1,stimulusSetVersion:'matrix-generator-v1.0.0'},
 {itemId:'matrix-practice-03',ruleFamily:'combination',difficulty:2,panels:[2,3,5,4,1,5,6,2],options:[3,6,8,4],correctOption:2,stimulusSetVersion:'matrix-generator-v1.0.0'},
 {itemId:'matrix-practice-04',ruleFamily:'progression',difficulty:2,panels:[1,3,5,4,6,8,6,8],options:[1,5,7,2],correctOption:3,stimulusSetVersion:'matrix-generator-v1.0.0'},
]
