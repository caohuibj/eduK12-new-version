// Pure selector/actual-component markup contract, not a browser/application qualification.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const front=path.resolve(__dirname,'../frontend'),req=Module.createRequire(path.join(front,'package.json')),ts=req('typescript'),React=req('react'),{renderToStaticMarkup}=req('react-dom/server'),{JSDOM}=req('jsdom'),{computeAccessibleName}=req('dom-accessibility-api')
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://school.eduk12.top/workspace'});global.window=dom.window;global.document=dom.window.document
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,file)=>{assert(file.startsWith(front+'/src/'));m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file)}
const {SchoolProfessionalHome,SchoolProfessionalNavigation}=require(path.join(front,'src/school/SchoolProfessionalWorkspace.tsx')),{schoolNavigation}=require(path.join(front,'src/school/school-navigation.ts'))
const items=schoolNavigation('TEACHER',null,{orgRole:'MEMBER',canGovern:false,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]},false,true).filter(i=>!['overview','account'].includes(i.id))
document.body.innerHTML=renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(SchoolProfessionalNavigation,{items,page:'overview',onNavigate(){}}),React.createElement(SchoolProfessionalHome,{items,username:'Synthetic manager',onNavigate(){}})))
const headings=[...document.querySelectorAll('h1,h2,h3,h4')].filter(n=>computeAccessibleName(n)==='我的工具'),links=[...document.querySelectorAll('a')]
assert.equal(links.filter(n=>computeAccessibleName(n)==='我的工具').length,0,'Old exact-link selector must reproduce mismatch')
const {managementToolLink}=require('./pr363-browser.cjs')
const locator=nodes=>({nodes,filter({has}){return locator(nodes.filter(n=>has.nodes.some(child=>n.contains(child))))}})
const page={getByRole(role,{name}={}){let nodes=role==='link'?links:headings;if(name)nodes=nodes.filter(n=>computeAccessibleName(n)===name);return locator(nodes)}}
const selected=managementToolLink(page,'SCHOOL').nodes;assert.equal(selected.length,1);assert.equal(selected[0].getAttribute('href'),'/workspace/private-tools');assert(selected[0].contains(headings[0]));console.log(JSON.stringify({kind:'actual-source-navigation-selector-contract',oldExactLinkMatches:0,correctCardMatches:1,studentOrGrantBypass:false,browserExecuted:false}));dom.window.close()
// The shared native field intentionally uses controlled React state, not a value attribute.
const {OnlineAnswerField}=require(path.join(front,'src/modules/situational/OnlineAnswerField.tsx')),{nativeOptionLabel}=require('./pr363-browser.cjs'),template=require('./pr363-native-template.json')
for(const [q,key]of [['PLAN_CHOICE','A'],['PLAN_PROBE','CHECK'],['REVIEW_CHOICE','A'],['REVIEW_PROBE','CHECK']]){
 const d=new JSDOM(renderToStaticMarkup(React.createElement(OnlineAnswerField,{channel:{responseType:'SINGLE_CHOICE',required:true,options:template.options.filter(o=>o.questionKey===q)},onChange(){},name:q})))
 assert.equal(d.window.document.querySelectorAll('input[value="'+key+'"]').length,0)
 assert.equal([...d.window.document.querySelectorAll('input[type=radio]')].filter(n=>computeAccessibleName(n)===nativeOptionLabel(q,key)).length,1);d.window.close()
}
console.log(JSON.stringify({kind:'actual-native-field-accessible-label-contract',oldValueAttributes:0,verifiedVisibleOptionLabels:4,browserExecuted:false}))
