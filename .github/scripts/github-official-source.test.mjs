import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const read=file=>readFileSync(file,'utf8');
const bindings=JSON.parse(read('.github/scripts/access-efficiency-bindings.json'));
const before=file=>execFileSync('git',['show',bindings.files[file]?.before||bindings.officialSourceBindings[file]?.before],{encoding:'utf8'});
test('every GitHub workflow fixes official npm transport, including old lockfile hosts',()=>{
 for(const name of readdirSync('.github/workflows').filter(name=>name.endsWith('.yml'))){
  const source=read('.github/workflows/'+name),env=source.split('\nenv:\n')[1]?.split(/\n[^\s#][^\n]*:\n/)[0];
  assert.ok(env?.includes('  NPM_CONFIG_REGISTRY: https://registry.npmjs.org\n'),name);
  assert.ok(env?.includes('  NPM_CONFIG_REPLACE_REGISTRY_HOST: always\n'),name);
 }
 for(const component of ['frontend','backend']){
  const file='server-version/'+component+'/Dockerfile';
  assert.equal(read(file),before(file).replace('RUN npm config set registry "$NPM_REGISTRY" && npm ci','RUN npm config set registry "$NPM_REGISTRY" && npm config set replace-registry-host always && npm ci'));
 }
 for(const file of ['.github/scripts/campus-candidate.py','server-version/scripts/release/build.py','server-version/scripts/release/package.py'])
  assert.equal(read(file),before(file).replaceAll('mirrors.tuna.tsinghua.edu.cn','deb.debian.org'));
});
test('npm really replaces an unreachable historical registry host and retains integrity rejection', {timeout:90000},async()=>{
 const metadata=await (await fetch('https://registry.npmjs.org/is-number/7.0.0',{signal:AbortSignal.timeout(10000)})).json();
 assert.equal(metadata.version,'7.0.0');assert.equal(new URL(metadata.dist.tarball).hostname,'registry.npmjs.org');
 const directory=mkdtempSync(join(tmpdir(),'official-npm-'));
 try{
  const manifest={name:'official-source-synthetic',version:'1.0.0',dependencies:{'is-number':'7.0.0'}};
  const lock={name:manifest.name,version:manifest.version,lockfileVersion:3,requires:true,packages:{'':manifest,'node_modules/is-number':{version:'7.0.0',resolved:'https://historical-registry.invalid/is-number/-/is-number-7.0.0.tgz',integrity:metadata.dist.integrity}}};
  writeFileSync(join(directory,'package.json'),JSON.stringify(manifest));writeFileSync(join(directory,'package-lock.json'),JSON.stringify(lock));
  const env={...process.env,NPM_CONFIG_REGISTRY:'https://registry.npmjs.org',NPM_CONFIG_REPLACE_REGISTRY_HOST:'always'};
  const args=['ci','--ignore-scripts','--audit=false','--fund=false','--loglevel=error','--fetch-retries=0','--cache',join(directory,'cache')];
  execFileSync('npm',args,{cwd:directory,env,timeout:45000,stdio:'pipe'});
  assert.equal(JSON.parse(read(join(directory,'node_modules/is-number/package.json'))).version,'7.0.0');
  const entry=lock.packages['node_modules/is-number'],prefix=entry.integrity.indexOf('-')+1;
  entry.integrity=entry.integrity.slice(0,prefix)+(entry.integrity[prefix]==='A'?'B':'A')+entry.integrity.slice(prefix+1);
  writeFileSync(join(directory,'package-lock.json'),JSON.stringify(lock));
  assert.throws(()=>execFileSync('npm',args.slice(0,-1).concat(join(directory,'bad-cache')),{cwd:directory,env,timeout:30000,stdio:'pipe'}),error=>/EINTEGRITY/.test(String(error.stderr)));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
