import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {decodeGradSubmission} from '/workspace/cognitive-review-horizon/server-version/backend/src/modules/cognitive/content-candidates/gradcpt/wire'
import {gradWireCanonicalJson,GRAD_WIRE_KIND,GRAD_WIRE_VERSION,GRAD_WIRE_CODEC} from '/workspace/cognitive-review-horizon/server-version/backend/src/modules/cognitive/content-candidates/gradcpt/wire-format'

const raw=JSON.parse(readFileSync('/workspace/cognitive-review-horizon/docs/cognitive-library/onboarding-content-20261028/parallel-review/grad-transport/raw/capture-prefix-experience-60.json','utf8'))
const plain=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(gradWireCanonicalJson(raw),'utf8')])
const packed=gzipSync(plain),wire={kind:GRAD_WIRE_KIND,version:GRAD_WIRE_VERSION,codec:GRAD_WIRE_CODEC,decodedLength:plain.length,sha256:createHash('sha256').update(plain).digest('hex'),data:packed.toString('base64')}
let accepted=false,error:string|null=null,equalRaw=false
try{const decoded=decodeGradSubmission(wire);accepted=true;equalRaw=gradWireCanonicalJson(decoded)===gradWireCanonicalJson(raw)}catch(e){error=e instanceof Error?e.message:String(e)}
const receipt={node:process.version,kind:'MINIMAL_UTF8_BOM_CANONICAL_BOUNDARY_PROBE_NO_SCORER',sourceSHA256:createHash('sha256').update(readFileSync('/workspace/cognitive-review-horizon/server-version/backend/src/modules/cognitive/content-candidates/gradcpt/wire.ts')).digest('hex'),decodedBytes:plain.length,packedBytes:packed.length,accepted,equalRaw,error,expected:'reject; UTF-8 BOM-prefixed JSON bytes are not the canonical JSON encoding',scorerInvocations:0}
writeFileSync(new URL(accepted?'./bom-original.json':'./bom-corrected.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n')
console.log(JSON.stringify(receipt,null,2));process.exitCode=accepted?1:0
