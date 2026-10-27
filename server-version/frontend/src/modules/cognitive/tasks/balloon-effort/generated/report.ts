// Exact pure content projection. Backend SHA256: c649dff623d791d09571393e35611297d89dea7b268eb761f43166daab142aff
import {EFFORT_IDENTITY,type Profile} from './protocol'
export interface ChoiceGroup {valid:number;high:number;noChoice:number}
export interface ExecutionGroup {trials:number;presses:number;seconds:number;pressesPerSecond:number}
export interface EffortReport {testType:'balloon-effort';engineVersion:'0.1.0';scoringVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';
 configHash:string;protocolSignature:string;profile:Profile;state:'interpretable'|'limited'|'invalid';incentive:'task-points-only-no-cash-promise';planned:number;received:number;valid:number;high:number;noChoice:number;technical:number;
 executionCount:number;totalPresses:number|null;knownTaskPoints:number|null;byEffort:Record<string,ChoiceGroup>;byReward:Record<string,ChoiceGroup>;byProbability:Record<string,ChoiceGroup>;conditions:Record<string,ChoiceGroup>;executionByInput:Record<string,ExecutionGroup>}
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0
export function isEffortReport(value:unknown,expected?:{configHash:string;protocolSignature:string;profile:Profile;received?:number}):value is EffortReport{
 if(!value||typeof value!=='object')return false;const r=value as EffortReport,hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
 if(r.testType!==EFFORT_IDENTITY.testType||r.engineVersion!==EFFORT_IDENTITY.engineVersion||r.scoringVersion!==EFFORT_IDENTITY.scoringVersion||r.reportDefinitionVersion!=='0.1.0'||r.presentationVersion!=='0.1.0'
  ||!hex(r.configHash)||!hex(r.protocolSignature)||!['research','experience'].includes(r.profile)||r.planned!==(r.profile==='research'?72:18)||r.incentive!=='task-points-only-no-cash-promise'
  ||!['interpretable','limited','invalid'].includes(r.state)||![r.received,r.valid,r.high,r.noChoice,r.technical,r.executionCount].every(int)||r.received>r.planned||r.valid+r.noChoice>r.received
  ||r.high>r.valid||r.technical>r.received||r.executionCount>r.valid)return false
 if(expected&&(expected.configHash!==r.configHash||expected.protocolSignature!==r.protocolSignature||expected.profile!==r.profile||(expected.received!==undefined&&expected.received!==r.received)))return false
 const groupValid=(g:ChoiceGroup)=>g&&[g.valid,g.high,g.noChoice].every(int)&&g.high<=g.valid
 const groups=(object:Record<string,ChoiceGroup>,keys:string[])=>{if(!object||typeof object!=='object'||Object.keys(object).length!==keys.length||keys.some(k=>!groupValid(object[k])))return false
  const sum=(key:keyof ChoiceGroup)=>Object.values(object).reduce((n,g)=>n+g[key],0);return sum('valid')===r.valid&&sum('high')===r.high&&sum('noChoice')===r.noChoice}
 const cells:string[]=[];for(const e of [50,100,200])for(const reward of [3,5,7])for(const p of [1,0.5])cells.push(`${e}/${reward}/${p}`)
 if(!groups(r.conditions,cells)||!groups(r.byEffort,['50','100','200'])||!groups(r.byReward,['3','5','7'])||!groups(r.byProbability,['1','0.5']))return false
 for(const g of Object.values(r.conditions))if(g.valid+g.noChoice>(r.profile==='research'?4:1))return false
 if(r.executionCount===0?(r.totalPresses!==null||r.knownTaskPoints!==null):(!int(r.totalPresses)||typeof r.knownTaskPoints!=='number'||!Number.isFinite(r.knownTaskPoints)||r.knownTaskPoints<0))return false
 if(!r.executionByInput||typeof r.executionByInput!=='object')return false;let trials=0,presses=0
 for(const [key,g] of Object.entries(r.executionByInput)){if(!['touch','mouse','pen','keyboard','mixed','unknown'].includes(key)||!int(g.trials)||!int(g.presses)||!Number.isFinite(g.seconds)||g.seconds<=0
   ||!Number.isFinite(g.pressesPerSecond)||Math.abs(g.pressesPerSecond-g.presses/g.seconds)>1e-6)return false;trials+=g.trials;presses+=g.presses}
 if(trials!==r.executionCount||(r.executionCount>0&&presses!==r.totalPresses))return false
 return r.state==='invalid'?r.valid===0:r.state==='interpretable'?r.valid===r.planned&&r.received===r.planned&&r.executionCount===r.valid&&r.technical===0&&r.noChoice===0:r.valid>0&&(r.valid<r.planned||r.technical>0||r.noChoice>0)
}
/** Invalid reports retain audit counts but hide all choice/execution performance data. */
export function projectEffortReport(score:{metrics:Record<string,unknown>;quality:{state:string};audit:{scorerVersion:string}}):EffortReport{
 const m=score.metrics,b=m.reportBinding as Record<string,unknown>|undefined
 if(!b||b.testType!==EFFORT_IDENTITY.testType||b.engineVersion!==EFFORT_IDENTITY.engineVersion||b.scoringVersion!==EFFORT_IDENTITY.scoringVersion||b.reportDefinitionVersion!=='0.1.0'||score.audit.scorerVersion!==EFFORT_IDENTITY.scoringVersion)throw Error('Unknown effort report binding')
 const report:unknown={...EFFORT_IDENTITY,reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',configHash:b.configHash,protocolSignature:b.protocolSignature,profile:b.profile,incentive:b.incentive,state:score.quality.state,
  planned:m.expectedTrialCount,received:m.receivedTrialCount,valid:m.validChoiceCount,high:m.highEffortChoiceCount,noChoice:m.noChoiceCount,technical:m.technicalRecordCount,executionCount:m.validExecutionCount,
  totalPresses:m.totalPresses,knownTaskPoints:m.knownTaskPoints,byEffort:m.choicesByEffort,byReward:m.choicesByReward,byProbability:m.choicesByProbability,conditions:m.choicesByCondition,executionByInput:m.executionByInput}
 if(!isEffortReport(report))throw Error('Inconsistent effort public report')
 return report
}
export const EFFORT_REPORT_COPY={zh:{title:'哪些条件下，你愿意多按一些？',explanation:'这是这组收益、概率和操作条件下的取舍。选择较多并非总是更好，选择较少也不代表不努力。',
 tip:'安排重复操作时，可以把收益、时间和疲劳一起考虑。这份记录不用于评价是否勤奋或是否胜任工作。',limit:'本次仅记录任务点数，不承诺现金兑换；设备、手部状态和理解会影响选择。没有常模排名、人格或临床结论。'},
 en:{title:'Under which offers did you choose more presses?',explanation:'These choices describe this set of rewards, probabilities and controls. More effort is not always better; fewer presses do not mean less diligence.',
 tip:'For repeated tasks, consider reward, time and fatigue together. This record does not rate diligence or suitability for a job.',limit:'These are task points without a cash promise. Device, hand comfort and understanding may affect choices. No norms, personality or clinical conclusions are provided.'}}
