import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {finalizeAttempt} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/content-candidates/serial-reaction-learning/attempt'
import {same} from '/workspace/eduK12-new-version/server-version/backend/src/modules/cognitive/content-candidates/serial-reaction-learning/protocol'
const root='/workspace/eduK12-new-version/docs/cognitive-library/scenario-roadmap-20261027/domains/child-learning/serial-reaction-learning-implementation',bytes=readFileSync(root+'/actual-browser-originals.json'),calls=JSON.parse(bytes.toString()).nativeCalls
for(const call of calls)if(!same(finalizeAttempt(call.input),call.result))throw Error('Final capacity guard changed an existing ordinary original/result')
const record={synthetic:true,participantData:false,originalSha256:createHash('sha256').update(bytes).digest('hex'),replayedNativeCalls:calls.length,scoreAndReportIdentical:true,change:'Final guards reject a2049th tap and map only actual blur/visibility events; existing captures and results unchanged',browserFlowRepeated:false}
writeFileSync(root+'/final-original-replay.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
