'use strict'
const { test } = require('node:test'), assert = require('node:assert/strict')
const { allowed, clean, location, BRANCH } = require('./school-teacher-anonymous-diagnostic.cjs')
const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_JOB: 'launch-diagnostic', GITHUB_REPOSITORY: 'caohuibj/eduK12-new-version', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/' + BRANCH, GITHUB_SHA: 'a'.repeat(40) }
const event = { deleted: false, repository: { full_name: env.GITHUB_REPOSITORY }, after: env.GITHUB_SHA }
test('anonymous diagnostic only admits exact nondeleted same-repository branch and source', () => {
 assert.equal(allowed(env,event),true)
 for(const [key,value] of [['CI','false'],['GITHUB_JOB','browser'],['GITHUB_ACTIONS','false'],['GITHUB_REPOSITORY','other/repo'],['GITHUB_EVENT_NAME','pull_request'],['GITHUB_REF','refs/heads/main'],['GITHUB_SHA','bad']]) assert.equal(allowed({...env,[key]:value},event),false)
 for(const e of [{...event,deleted:true},{...event,after:'b'.repeat(40)},{...event,repository:{full_name:'other/repo'}},{}])assert.equal(allowed(env,e),false)
})
test('anonymous console text is bounded and removes credential fields queries userinfo and long tokens', () => {
 const raw='https://user:pass@school.eduk12.top/login?token=secret#code password=abc authorization=def Bearer hi person@example.org '+ 'a'.repeat(70)
 const value=clean(raw); for(const secret of ['user:pass','?token','#code','password=abc','authorization=def','Bearer hi','person@example.org','a'.repeat(70)])assert.equal(value.includes(secret),false)
 assert.ok(clean('x'.repeat(5000)).length<=1024)
 assert.deepEqual(location({url:'https://school.eduk12.top/login?q=secret',lineNumber:2,columnNumber:9}),{path:'/login',line:2,column:9})
 assert.equal(location({url:'https://external.example/private?q=x'}).path,'[NONLOCAL]')
})
