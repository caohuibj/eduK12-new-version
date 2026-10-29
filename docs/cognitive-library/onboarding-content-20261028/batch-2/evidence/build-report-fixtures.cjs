const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../../..'),backend=path.join(root,'server-version/backend'),ts=require(path.join(backend,'node_modules/typescript'));
require(path.join(backend,'node_modules/tsx/dist/cjs/index.cjs'));
const hash=body=>crypto.createHash('sha256').update(body).digest('hex');
const tasks=[
 ['blink','attentional-blink-content.test.ts','attentional-blink','scoreBlink','projectBlinkReport',['experience','known']],
 ['dual','dual-arrow-content.test.ts','dual-arrow','scoreDual','projectDualReport',['experience']],
 ['grad','gradcpt-content.test.ts','gradcpt','scoreGrad','projectGradReport',['experience']],
 ['hf','hearts-flowers-content.test.ts','hearts-flowers','scoreHF','projectHFReport',['experience']],
 ['horizon','horizon-content.test.ts','horizon-exploration','scoreHorizon','projectHorizonReport',['experience']],
 ['spatial','spatial-memory-content.test.ts','precision-working-memory','scoreSpatialMemory','projectSpatialReport',['experience']],
 ['search','visual-search-content.test.ts','visual-search','scoreSearch','projectSearchReport',['experience',true]],
];
const reports={},inputs={},provenance=[];
for(const [key,test,folder,scorerName,projectionName,args] of tasks){
 const file=path.join(backend,'src/__tests__/cognitive',test),body=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,body,ts.ScriptTarget.Latest,true);
 const statements=ast.statements.filter(n=>ts.isFunctionDeclaration(n)||ts.isImportDeclaration(n)&&n.moduleSpecifier.text!=='vitest'||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='seed'));
 const source=statements.map(n=>n.getText(ast)).join('\n')+'\nexports.fixture=fixture;';
 const transformed=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(path.dirname(file));loaded._compile(transformed,file);
 const input=loaded.exports.fixture(...args),score=require(path.join(backend,'src/modules/cognitive/content-candidates',folder,'scorer.ts'))[scorerName],project=require(path.join(backend,'src/modules/cognitive/content-candidates',folder,'report.ts'))[projectionName];
 const variants={complete:input,limited:{...input,trials:input.trials.slice(0,1)},invalid:{...input,trials:[]}};
 if(key==='grad'){
  const raw=structuredClone(input.trials[0].payload),cut=raw.slots[20].endMs;raw.endedAtPerfMs=cut;raw.status='interrupted';raw.stopReason='participant-ended';raw.slots=raw.slots.filter(s=>s.endMs<=cut);raw.frames=raw.frames.filter(f=>f.atMs<=cut&&f.slotIndex<raw.slots.length);raw.events=raw.events.filter(e=>e.atMs<=cut);
  const envelope=require(path.join(backend,'src/modules/cognitive/content-candidates',folder,'scorer.ts')).gradEnvelope(raw);variants.limited={...input,trials:[envelope]};
 }
 reports[key]={};inputs[key]={};
 for(const [state,raw] of Object.entries(variants)){inputs[key][state]=raw;reports[key][state]=project(score(raw));if(reports[key][state].state!==state.replace('complete','interpretable'))throw Error(key+' unexpected '+state+' state '+reports[key][state].state)}
 provenance.push({key,source:path.relative(root,file),sourceSHA256:hash(body),extractedHelperSHA256:hash(source),args,executedAssertions:0,note:'Reuses existing exact helper declarations; no original describe/it/assertion executed. New representative inputs feed only changed report consumers.'});
}
fs.writeFileSync(path.join(__dirname,'report-public-fixtures.json'),JSON.stringify(reports,null,2));
fs.writeFileSync(path.join(__dirname,'report-raw-inputs.json'),JSON.stringify({synthetic:true,inputs}));
fs.writeFileSync(path.join(__dirname,'report-fixture-provenance.json'),JSON.stringify({synthetic:true,tasks:provenance},null,2));
console.log('New presentation fixtures from exact existing helpers: '+Object.keys(reports).join(', '));
