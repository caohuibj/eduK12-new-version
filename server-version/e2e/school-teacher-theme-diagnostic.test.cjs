const assert=require('node:assert/strict')
const {allowed}=require('./school-teacher-theme-diagnostic.cjs')
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_JOB:'launch-diagnostic',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/ci/school-teacher-console-20261023',GITHUB_SHA:'a'.repeat(40)}
const event={deleted:false,repository:{full_name:env.GITHUB_REPOSITORY},after:env.GITHUB_SHA}
assert(allowed(env,event));for(const key of Object.keys(env))assert.equal(allowed({...env,[key]:'wrong'},event),false,key)
assert.equal(allowed(env,{...event,deleted:true}),false);assert.equal(allowed(env,{...event,after:'b'.repeat(40)}),false)
console.log('1 exact diagnostic context contract passed; no browser or permissions executed')

const {waitParticipantComplete}=require('./school-teacher-theme-diagnostic.cjs')
const {test}=require('node:test')
test('waits for actual split School completion markup and preserves Teacher exact text',async()=>{
 const calls=[];const wait={waitFor:async()=>{}};
 const status={getByRole:(role,options)=>{calls.push(['statusRole',role,options]);return wait},getByText:(text,options)=>{calls.push(['statusText',text,options]);return wait}}
 const page={locator:selector=>{calls.push(['locator',selector]);return status},getByText:(text,options)=>{calls.push(['pageText',text,options]);return wait}}
 await waitParticipantComplete(page,'school')
 assert.deepEqual(calls,[['locator','.hs-runner .hs-message[role="status"]'],['statusRole','heading',{name:'合成表单演示已完成',exact:true}],['statusText','这不是正式提交，没有产生 FINAL。',{exact:true}],['statusRole','button',{name:'返回合成表单',exact:true}]])
 calls.length=0;await waitParticipantComplete(page,'teacher')
 assert.deepEqual(calls,[['pageText','合成表单演示已完成。这不是正式提交，没有产生 FINAL。',{exact:true}]])
})
