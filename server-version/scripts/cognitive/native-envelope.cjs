const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
/** Browser envelopes are generated from the task-owned backend export, not maintained as a second implementation. */
module.exports=function({source,out,check}){
 const root=path.resolve(__dirname,'../../..'),ts=require(path.join(root,'server-version/backend/node_modules/typescript')),
 file=path.join(source,'scorer.ts'),text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const declarations=ast.statements.filter(ts.isVariableStatement).filter(s=>s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))
  .flatMap(s=>[...s.declarationList.declarations]).filter(d=>/Envelope$/.test(d.name.getText(ast)));
 declarations.push(...ast.statements.filter(ts.isFunctionDeclaration).filter(d=>d.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&d.name&&/Envelope$/.test(d.name.getText(ast))));
 if(declarations.length!==1)throw Error('Expected one task-owned envelope export: '+file);
 const d=declarations[0],fn=ts.isFunctionDeclaration(d)?ts.factory.createArrowFunction(undefined,undefined,d.parameters,undefined,undefined,d.body):d.initializer;if(!fn||!ts.isArrowFunction(fn)||fn.parameters.length!==1||!fn.parameters[0].type)throw Error('Unsupported envelope export');
 const arrow=ts.factory.updateArrowFunction(fn,fn.modifiers,fn.typeParameters,fn.parameters,undefined,fn.equalsGreaterThanToken,fn.body),printer=ts.createPrinter();
 const body='// Generated from exact task-owned envelope SHA256: '+crypto.createHash('sha256').update(d.getText(ast)).digest('hex')+'\n'
  +"import type {"+fn.parameters[0].type.getText(ast)+"} from './protocol'\nexport const "+d.name.getText(ast)+' = '+printer.printNode(ts.EmitHint.Expression,arrow,ast)+'\n';
 const target=path.join(out,'envelope.ts');if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==body)throw Error('Native envelope projection drift: '+file)}
 else {fs.mkdirSync(out,{recursive:true});fs.writeFileSync(target,body)}
};
