import type { DisclosureCapabilitiesV1 } from '../../scale/policy/types'
import type { DeclarativePackage } from '../onboarding/contract'
import type { ProfileResult } from './match'

export interface ProfileView {
  schemaVersion:'bundle-profile-view-v1'
  state:ProfileResult['state']|'WITHHELD'
  title:string; explanation:string|null; profileId:string|null
  constructs:Array<{key:string;label:string;raw:number;min:number;max:number;referenceCenter:number|null}>
  candidates:Array<{profileId:string;name:string;matchingScore:number}>
  alternatives:string[]
  actions:string[]
  methods:ProfileResult['model']|null
  limitation:string
}
/** Server-only dependency intersection. Never send full results for CSS to hide. */
export function projectProfileView(result:ProfileResult,pack:DeclarativePackage,policies:ReadonlyMap<string,DisclosureCapabilitiesV1|null>,technical:boolean):ProfileView {
  if(pack.schemaVersion!==2)throw new Error('PROFILE_PACKAGE_REQUIRED')
  const model=pack.profile
  const policyFor=(evidenceKey:string)=>policies.get(pack.evidence.find(e=>e.evidenceKey===evidenceKey)?.slotKey??'')
  const corePolicies=model.bindings.map(b=>policyFor(b.evidenceKey))
  const every=(capability:keyof DisclosureCapabilitiesV1)=>corePolicies.length>0 && corePolicies.every(p=>p?.[capability]===true)
  const interpret=every('individualInterpretations') && every('scoreDerivedLabels')
  const numeric=every('numericScores')
  const profile=interpret?model.profiles.find(p=>p.id===result.profileId):undefined
  const view:ProfileView={
    schemaVersion:'bundle-profile-view-v1',state:interpret?result.state:'WITHHELD',
    title:interpret?(profile?.name??String(model.states[result.state])):'当前权限未开放个体画像解释',
    explanation:profile?.summary??null,profileId:profile?.id??null,
    constructs:result.constructs.filter(c=>policyFor(c.evidenceKey)?.numericScores).map(c=>({
      key:c.key,label:c.label,raw:c.raw,min:c.min,max:c.max,
      referenceCenter:profile && numeric?c.min+(c.max-c.min)*(c.orientation==='DIRECT'?profile.centers[c.key]:1-profile.centers[c.key]):null,
    })),
    candidates:technical && interpret && numeric && every('methods')?result.candidates.map(c=>({profileId:c.profileId,name:model.profiles.find(p=>p.id===c.profileId)!.name,matchingScore:c.matchingScore})):[],
    alternatives:interpret && result.state==='MIXED'?result.candidates.slice(0,2).map(c=>model.profiles.find(p=>p.id===c.profileId)!.name):[],
    actions:profile && every('educationalContent')?profile.actions.map(a=>a.text):[],
    methods:every('methods')?{...result.model}:null,
    limitation:'理论试验画像；预设中心与分界尚未经真实人群验证。匹配分不是概率或常模，不用于诊断、排名或能力判断。',
  }
  return view
}

