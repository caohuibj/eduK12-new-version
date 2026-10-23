const assert=require('node:assert/strict')
const {allowed}=require('./school-teacher-theme-diagnostic.cjs')
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_JOB:'launch-diagnostic',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/ci/school-teacher-console-20261023',GITHUB_SHA:'a'.repeat(40)}
const event={deleted:false,repository:{full_name:env.GITHUB_REPOSITORY},after:env.GITHUB_SHA}
assert(allowed(env,event));for(const key of Object.keys(env))assert.equal(allowed({...env,[key]:'wrong'},event),false,key)
assert.equal(allowed(env,{...event,deleted:true}),false);assert.equal(allowed(env,{...event,after:'b'.repeat(40)}),false)
console.log('1 exact diagnostic context contract passed; no browser or permissions executed')
