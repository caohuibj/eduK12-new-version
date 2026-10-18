import { describe, expect, it } from 'vitest'
import { onlineAnswerComplete, onlineResponses, onlineRunnerDefinition, withOnlineRunner, type OnlineFrozenDisplay } from '../online'
import { firstMissingSceneIndex, situationalReadyToSubmit } from '../draft'
import { newOnlineDocument } from '../OnlineAuthorEditor'
const online:OnlineFrozenDisplay={responseProtocol:'sjt-online-response-v1',compilerVersion:'test',definitionHash:'frozen',displayHash:'display',display:{title:'Frozen',respondentType:'student_self_report',scenes:[{sceneKey:'mother',title:'Scenario',stimulus:'Original text',questions:[{questionKey:'q',prompt:'Pick',responseType:'MULTIPLE',required:true,allowRefusal:true,minSelections:2,maxSelections:2,exclusiveOptionKeys:['none'],options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'},{optionKey:'none',label:'None'}]}]}]}}
describe('online frozen response projection',()=>{
 it('renders real options rather than derived scoring combination keys',()=>{const d=onlineRunnerDefinition(online);expect(d.scenes[0].channels[0]).toMatchObject({responseType:'MULTIPLE_CHOICE',options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'},{optionKey:'none',label:'None'}]});expect(d.scenes[0].sceneKey).toBe('sjt_q_q')})
 it('requires valid cardinality and permits explicit refusal or exclusive singleton',()=>{const d=onlineRunnerDefinition(online),c=d.scenes[0].channels[0];expect(onlineAnswerComplete(c,{responseValue:['a'],status:'ANSWERED'})).toBe(false);expect(firstMissingSceneIndex(d,{'sjt_q_q:q':{responseValue:['a']}})).toBe(0);expect(situationalReadyToSubmit(d,{'sjt_q_q:q':{responseValue:['a','b'],status:'ANSWERED'}})).toBe(true);expect(onlineAnswerComplete(c,{responseValue:['none']})).toBe(true);expect(onlineAnswerComplete(c,{responseValue:['none','a']})).toBe(false);expect(onlineAnswerComplete(c,{responseValue:'',status:'REFUSED'})).toBe(true);expect(onlineAnswerComplete(c,{responseValue:'',status:'BLANK'})).toBe(false)})
 it('serializes raw array and explicit statuses without fake scored options',()=>{const d=onlineRunnerDefinition(online);expect(onlineResponses(d,{'sjt_q_q:q':{responseValue:['a','b'],status:'ANSWERED'}})).toEqual([{sceneKey:'sjt_q_q',channelKey:'q',status:'ANSWERED',responseValue:['a','b']}]);expect(onlineResponses(d,{'sjt_q_q:q':{responseValue:'',status:'REFUSED'}})).toEqual([{sceneKey:'sjt_q_q',channelKey:'q',status:'REFUSED'}]);expect(onlineResponses(d,{})).toEqual([{sceneKey:'sjt_q_q',channelKey:'q',status:'BLANK'}])})
 it('leaves old server payloads untouched',()=>{const legacy={instrument:{definition:{schemaVersion:1}}} as Parameters<typeof withOnlineRunner>[0];expect(withOnlineRunner(legacy)).toBe(legacy)})
 it('does not invent a golden oracle for a new author document',()=>{expect(newOnlineDocument().goldenCases).toEqual([]);expect(newOnlineDocument().templateVersion).toBe('sjt-online-v1')})
 it('preserves student identity and sequential order across multiple mother scenes',()=>{
  const source=structuredClone(online)
  source.display.scenes[0].questions.push({...source.display.scenes[0].questions[0],questionKey:'q2'})
  source.display.scenes.push({...structuredClone(source.display.scenes[0]),sceneKey:'mother2',questions:[{...source.display.scenes[0].questions[0],questionKey:'q3'}]})
  const d=onlineRunnerDefinition(source)
  expect(d.respondentType).toBe('student_self_report')
  expect(d.scenes.map(s=>[s.sceneKey,s.sortOrder])).toEqual([['sjt_q_q',0],['sjt_q_q2',1],['sjt_q_q3',2]])
 })

})
