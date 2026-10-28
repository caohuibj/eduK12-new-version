import {writeFileSync} from 'node:fs'
import {prisma} from '../../../../../server-version/backend/src/config/database'
import {decryptUnifiedRuntimePayload} from '../../../../../server-version/backend/src/modules/assessment-runtime/security'
import {decryptCognitivePayload} from '../../../../../server-version/backend/src/modules/cognitive/cognitive.security'
import {canonicalHash} from '../../../../../server-version/backend/src/modules/assessment-runtime/canonical'
async function main(){try{
 const session=await prisma.cognitiveSession.findFirstOrThrow({where:{testType:'hearts-flowers',status:'COMPLETED',submissionId:{startsWith:'completion-'}},orderBy:{finishedAt:'desc'}})
 const raw=await prisma.cognitiveRawSubmission.findUniqueOrThrow({where:{sessionId_attemptEpoch:{sessionId:session.id,attemptEpoch:session.attemptNo}}})
 const core=decryptUnifiedRuntimePayload<any>(raw.payloadEncrypted),result=decryptCognitivePayload<any>(session.resultSnapshotEncrypted!)
 const output={synthetic:true,source:'read-only existing disposable DB; no scoring or report regeneration',input:'parallel-review/hearts-flowers/completion-claim-regression.json',sessionId:session.id,submissionId:session.submissionId,coreHash:session.submissionPayloadHash,trialCount:core.trials.length,trialsHash:canonicalHash(core.trials),nativeCompletion:core.nativeCompletion,quality:result.quality,metrics:{receivedTrialCount:result.metrics.receivedTrialCount,validTrialCount:result.metrics.validTrialCount},publicReport:result.report.nativeReport}
 writeFileSync(new URL('./frozen-completion-result.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({trialCount:output.trialCount,state:output.quality.state,coreHash:output.coreHash}))
}finally{await prisma.$disconnect()}}
void main()
