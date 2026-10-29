/** Pure frozen teaching contract. No runtime, asset rights or publication authority. */
export const RECOGNITION_GUIDED_IDENTITY = Object.freeze({testType:'continuous-recognition',engineVersion:'0.2.0',scoringVersion:'0.2.0',configVersion:'0.3.0'} as const)
export const RECOGNITION_PRACTICE_POLICY = Object.freeze({version:'recognition-guided-practice-v1',trials:8,minimumCorrect:7,maxRounds:3,
  imageMs:1200,isiMs:800,feedback:'per_trial',repeatInstructionsBeforeRetry:true,sequenceVersion:'recognition-short-lag-eight-v1'} as const)
export type RecognitionPracticePolicy=typeof RECOGNITION_PRACTICE_POLICY
export const RECOGNITION_PRACTICE_ORDER:readonly number[]=Object.freeze([0,1,0,2,2,3,4,5])
/** Key order is immaterial; extra, missing or changed policy fields are rejected. */
export function assertRecognitionPracticePolicy(value:unknown):asserts value is RecognitionPracticePolicy {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(RECOGNITION_PRACTICE_POLICY).length
    ||Object.entries(RECOGNITION_PRACTICE_POLICY).some(([key,v])=>(value as Record<string,unknown>)[key]!==v))throw Error('Unsupported recognition practice policy')
}
export function recognitionPracticeManifest(ids:readonly string[]){
  if(ids.length!==6||new Set(ids).size!==6)throw Error('Six unique practice assets required')
  return RECOGNITION_PRACTICE_ORDER.map((asset,index)=>({index,assetId:ids[asset],seenBefore:RECOGNITION_PRACTICE_ORDER.indexOf(asset)<index}))
}
