const test=require('node:test')
const assert=require('node:assert/strict')
const {createDomainService}=require('../domains/shared/service')
const {createOperations}=require('../domains/operations/service')
test('student shared list honors bounded server hasMore without hiding later courses',async()=>{
 const urls=[]
 const api={get:async url=>{urls.push(url);return {list:[{id:'c',title:'Course'}],total:45,pageSize:20,hasMore:true,nextCursor:'c'}}}
 const service=createDomainService(api,{get:()=>({capabilities:{canReadCourses:true,canReadStudentTasks:true}})})
 assert.equal((await service.list('courses',1)).hasMore,true)
 assert.equal((await service.list('courses',2)).hasMore,true)
 assert.equal(urls[1],'/courses/my?page=2&pageSize=20')
})
test('teacher submissions expose continuation for the new response contract',async()=>{
 const api={get:async()=>({list:[{id:'s',student:{nickname:'Student'},content:'text'}],total:45,pageSize:20,hasMore:true})}
 const service=createOperations(api,{get:()=>({capabilities:{canReadCheckins:true}})})
 const result=await service.list('checkins',{parent:'task-1',view:'submissions',page:2})
 assert.equal(result.hasMore,true);assert.equal(result.list[0].sourcePage,2)
})
