const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const source=fs.readFileSync(process.env.SETTLE_SOURCE||__dirname+'/school-teacher-ui.cjs','utf8')
const fn=source.slice(source.indexOf('async function settleThemeTransitions('),source.indexOf('\nfunction appearanceKeys'))
async function scenario(makeFrames,{timeout=false,geometry=[]}={}){
 class Transition{constructor(state='running',pending=false,end=150){this.playState=state;this.pending=pending;this.transitionProperty='color';this.effect={getComputedTiming:()=>({endTime:end})};Object.defineProperty(this,'finished',{get(){throw Error('finished promise must not be awaited')}})}}
 let frames=0,cancelled=0;const sequence=makeFrames(Transition)
 const root={scrollWidth:320,scrollHeight:500,getBoundingClientRect:()=>({x:0,y:0,width:geometry[frames-1]??320,height:500}),getAnimations:()=>sequence[Math.min(frames-1,sequence.length-1)]}
 const context={document:{querySelector:()=>root},CSSTransition:Transition,Set,WeakSet,Number,Promise,Error,requestAnimationFrame:cb=>setImmediate(()=>{frames++;cb(frames*16)}),cancelAnimationFrame:id=>{cancelled++;clearImmediate(id)},setTimeout:(cb,ms)=>{assert.equal(ms,2000);return setTimeout(cb,timeout?15:1000)},clearTimeout}
 const run=vm.runInNewContext(fn+';settleThemeTransitions',context)
 return {run:()=>run('.fixture'),stats:()=>({frames,cancelled})}
}
test('finished nonpending transitions do not await offscreen finished promises; infinite CSSAnimation is excluded',async()=>{
 const s=await scenario(T=>[[new T('finished'),{playState:'running',pending:true,effect:{getComputedTiming:()=>({endTime:Infinity})}}]])
 assert.equal((await s.run()).settled,true);assert.equal(s.stats().frames,2)
})
test('running and pending transitions must end, including replaced or cancelled animation instances',async()=>{
 const s=await scenario(T=>[[new T()],[],[new T('finished',true)],[new T()],[],[]])
 assert.equal((await s.run()).settled,true);assert.equal(s.stats().frames,6)
})
test('no-active animation still requires two consecutive equal layout frames',async()=>{
 const s=await scenario(()=>[[]],{geometry:[320,321,322,322]});await s.run();assert.equal(s.stats().frames,4)
})
test('persistent active or nonfinite transitions still fail and cancel pending frames',async()=>{
 const s=await scenario(T=>[[new T()]],{timeout:true});await assert.rejects(s.run(),/within 2000ms/);assert.equal(s.stats().cancelled,1)
 const bad=await scenario(T=>[[new T('running',false,Infinity)]]);await assert.rejects(bad.run(),/Non-finite/)
})
