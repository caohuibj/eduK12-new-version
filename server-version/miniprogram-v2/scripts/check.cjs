const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const assert = require('node:assert/strict')
const root = path.resolve(__dirname,'..')
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!['tests','scripts'].includes(entry.name)?files(path.join(dir,entry.name)):entry.isFile()?[path.join(dir,entry.name)]:[])}
const tokens = JSON.parse(fs.readFileSync(path.join(root,'design-system/tokens/index.json'),'utf8'))
const tokenCss = '/* Generated from index.json; run node scripts/check.cjs --generate. */\npage, :host {\n'+Object.entries(tokens).flatMap(([group,values])=>Object.entries(values).map(([key,value])=>'  --'+group+'-'+key+': '+value+';\n')).join('')+'}\n'
if(process.argv.includes('--generate')) fs.writeFileSync(path.join(root,'design-system/tokens/index.wxss'),tokenCss)
assert.equal(fs.readFileSync(path.join(root,'design-system/tokens/index.wxss'),'utf8'),tokenCss,'design tokens out of sync')
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'))
for(const route of app.pages) {
 for(const suffix of ['.js','.json','.wxml']) assert.ok(fs.existsSync(path.join(root,route+suffix)),'missing registered page '+route+suffix)
 const config=JSON.parse(fs.readFileSync(path.join(root,route+'.json'),'utf8'))
 for(const component of Object.values(config.usingComponents||{})) for(const suffix of ['.js','.json','.wxml','.wxss']) assert.ok(fs.existsSync(path.join(root,component.slice(1)+suffix)),'missing component '+component+suffix)
 const markup=fs.readFileSync(path.join(root,route+'.wxml'),'utf8')
 for(const [,tag] of markup.matchAll(/<(hui-[a-z-]+)\b/g)) assert.ok(config.usingComponents[tag],'unregistered primitive '+tag)
}
// Exact retired mutation patterns; legitimate aggregate completion APIs are not banned by suffix.
const retired=[/['"]\/auth\/register['"]/,/\/assessments\/[^'"\s]+\/(?:answers(?:\/batch)?|form-answers(?:\/batch)?|form-answer|scale\/complete|context\/freeze)(?:['"?]|$)/,/\/attempts\/[^'"\s]+\/(?:save|context\/freeze|items\/[^/]+\/(?:scale\/answer|scale\/complete|form-answer))(?:['"?]|$)/,/\/sessions\/[^'"\s]+\/(?:trials(?:\/batch)?|complete)(?:['"?]|$)/]
let count=0
for(const file of files(root)) {
 const rel=path.relative(root,file); const source=fs.readFileSync(file,'utf8')
 if(file.endsWith('.json'))JSON.parse(source)
 if(file.endsWith('.js')) {
  new vm.Script(source,{filename:file});count++
  assert.ok(!/Authorization.{0,30}Bearer|connectSocket|formatScore|calculateScore|rawScore\s*[*/]/.test(source),'legacy/scoring reference '+rel)
  for(const pattern of retired) assert.ok(!pattern.test(source),'retired mutation '+rel)
  if(rel!=='core/api/client.js')assert.ok(!/\b(?:wx|platform)\.(?:request|uploadFile|downloadFile)\s*\(/.test(source),'transport outside API client '+rel)
  if(rel.startsWith('pages/'))assert.ok(!/\.(?:role|activeRole)\s*(?:===|!==)|\bapi\.(?:get|post|put|patch|delete|request)\(/.test(source),'page authorization/transport leak '+rel)
  if(!rel.startsWith('core/'))assert.ok(!/\b(?:wx|platform)\.(?:getStorage|setStorage|removeStorage)/.test(source),'storage outside core '+rel)
 }
 if(rel.startsWith('pages/')&&file.endsWith('.wxss'))assert.ok(!/(?:font-size|padding|border-radius|#[0-9a-f]{3,8})/.test(source),'page style bypasses tokens '+rel)
 if(file.endsWith('.wxml')) {
  assert.ok(!/wx:(?:if|elif|for)="(?!\{\{)/.test(source),'static WXML binding '+rel)
  const stack=[]
  for(const [,closing,tag,attrs] of source.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)>/g)) {
   if(closing)assert.equal(stack.pop(),tag,'unbalanced WXML '+rel)
   else if(!attrs.endsWith('/'))stack.push(tag)
  }
  assert.deepEqual(stack,[],'unclosed WXML '+rel)
 }
}
console.log('Static gates passed: '+count+' JS modules, '+app.pages.length+' routes, tokens, component registration, transport boundaries and retired contracts.')
