import test from 'node:test'
import assert from 'node:assert/strict'
import {parseRawDiff,admitScaleIntakeEntries} from './scale-intake-light-scope.mjs'
const inst='server-version/backend/src/modules/scale/instruments/ctas12_zh_cn/1.0.0/instrument.ts'
const ctas2='server-version/backend/src/modules/scale/instruments/ctas2_cognitive_en/1.0.0/instrument.ts'
const generated='server-version/backend/src/modules/scale/onboarding/instruments.generated.ts'
const doc='docs/scale-intake/test-anxiety-20261029.md'
const a=file=>({file,status:'A',oldMode:'000000',newMode:'100644'})
const m=file=>({file,status:'M',oldMode:'100644',newMode:'100644'})

test('three versions plus generated index and audit docs admit a narrow content intake',()=>{
 const r=admitScaleIntakeEntries([a(inst),a(ctas2),m(generated),a(doc)])
 assert.deepEqual(r.sources,[inst,ctas2])
 assert.equal(r.fileCount,4)
})
test('light CI control files are permitted only alongside actual scale instruments',()=>{
 const r=admitScaleIntakeEntries([a(inst),a('.github/workflows/scale-intake-light.yml'),a('.github/scripts/scale-intake-light-scope.test.mjs'),a('server-version/backend/scripts/scale-intake-light-check.ts')])
 assert.deepEqual(r.sources,[inst])
 assert.throws(()=>admitScaleIntakeEntries([a('.github/workflows/scale-intake-light.yml')]),/instrument.ts/)
})
test('shared runtime, schema, scorer, deps, platform CI, arbitrary docs cannot enter',()=>{
 for (const file of ['server-version/backend/src/modules/scale/scale-scoring.ts','server-version/backend/src/modules/scale/onboarding/types.ts','server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','.github/workflows/ci.yml','docs/release/README.md','server-version/backend/src/modules/scale/instruments/a/1.0.0/scorer.ts']) {
  assert.throws(()=>admitScaleIntakeEntries([a(inst),m(file)]),/cannot use scale-intake-lite/,file)
 }
})
test('deleted, renamed/type-changed and executable/symlink content do not enter light CI',()=>{
 for(const change of [{...m(inst),status:'D',newMode:'000000'},{...m(inst),status:'T'},{...a(inst),newMode:'120000'},{...m(inst),newMode:'100755'}])
  assert.throws(()=>admitScaleIntakeEntries([change]))
})
test('malformed, noncanonical paths and duplicate entries are rejected',()=>{
 for (const path of [inst.replace('instruments/','instruments//'),inst.replace('ctas12_zh_cn','..'),inst+'\n','server-version/backend/src/modules/scale/instruments/ctas12_zh_cn/1.0.0/other.ts'])
  assert.throws(()=>admitScaleIntakeEntries([a(path)]))
 assert.throws(()=>admitScaleIntakeEntries([a(inst),a(inst)]),/Duplicate/)
})
test('raw diff parser binds Git object types, status and zero delimiters',()=>{
 const x='a'.repeat(40),y='b'.repeat(40)
 const raw=':000000 100644 '+x+' '+y+' A\0'+inst+'\0'
 assert.deepEqual(parseRawDiff(raw),[a(inst)])
 for(const malformed of [':000000 100644 '+x+' '+y+' A\0'+inst,':invalid\0'+inst+'\0',':100644 100644 '+x+' '+y+' R100\0'+inst+'\0'])assert.throws(()=>parseRawDiff(malformed))
})
