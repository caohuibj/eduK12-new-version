import {mkdirSync,realpathSync,lstatSync,readFileSync,appendFileSync,writeFileSync}from 'node:fs';
import {join,resolve,basename}from 'node:path';
import {platform,arch}from 'node:os';
import {createHash}from 'node:crypto';
import {createRequire}from 'node:module';
import {spawnSync}from 'node:child_process';
import {pathToFileURL}from 'node:url';
export function browserCachePath(root,version,os=platform(),architecture=arch()){
 if(!['mac-light','mac-heavy','win-light','win-heavy'].includes(basename(root))||/[\x00-\x1f\x7f]/.test(root)||!/^\d+\.\d+\.\d+$/.test(version)||!['darwin','linux'].includes(os)||!['arm64','x64'].includes(architecture))throw new Error('Invalid isolated browser cache identity');
 if(realpathSync(root)!==resolve(root)||!lstatSync(root).isDirectory())throw new Error('Runner root must be a real directory');
 const cache=join(root,'cache','playwright',os+'-'+architecture,version);mkdirSync(cache,{recursive:true,mode:0o700});
 if(realpathSync(cache)!==cache)throw new Error('Browser cache cannot contain symlinks');return cache;
}
export function pinnedBrowserVersion(lock,runtime){
 const version=lock.packages?.['node_modules/playwright-core']?.version;
 if(!/^\d+\.\d+\.\d+$/.test(version??'')||lock.packages?.[''].dependencies?.['playwright-core']!==version||runtime.version!==version)throw new Error('Browser runtime does not match its exact lockfile');return version;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const engines=process.argv.slice(2);if(!engines.length||engines.some(x=>!['chromium','firefox','webkit'].includes(x))||new Set(engines).size!==engines.length)throw new Error('Select exact browser engines');
 const workspace=process.env.GITHUB_WORKSPACE,root=process.env.CI_RUNNER_ROOT;
 if(process.env.CI!=='true'||!workspace||!root)throw new Error('Browser cache requires its installed Actions lane');
 const runtime=join(workspace,'ci/browser/node_modules/playwright-core');
 const version=pinnedBrowserVersion(JSON.parse(readFileSync(join(workspace,'ci/browser/package-lock.json'),'utf8')),JSON.parse(readFileSync(join(runtime,'package.json'),'utf8')));
 const cache=browserCachePath(root,version);process.env.PLAYWRIGHT_BROWSERS_PATH=cache;process.env.PLAYWRIGHT_SKIP_BROWSER_GC='1';
 const require=createRequire(import.meta.url),browsers=require(runtime);
 for(const engine of engines){
  const type=browsers[engine],manifest=join(cache,'verified-'+engine+'.json');
  let usable=false;
  try{const known=JSON.parse(readFileSync(manifest,'utf8'));usable=known.version===version&&known.platform===platform()&&known.arch===arch()&&known.binarySha256===createHash('sha256').update(readFileSync(known.binary)).digest('hex');}catch{}
  if(!usable){
   const result=spawnSync(process.execPath,[join(runtime,'cli.js'),'install',...(platform()==='linux'?['--with-deps']:[]),engine],{env:process.env,stdio:'inherit'});
   if(result.status!==0)throw new Error('Pinned '+engine+' installation failed');
  }
  // Always render and exit under the actual runner service identity. A manifest
  // never turns a launch failure into success or suppresses the original error.
  const server=await type.launchServer({headless:true});
  try{
   const browser=await type.connect(server.wsEndpoint());const page=await browser.newPage();await page.setContent('<html><body>Huisurvey CI 浏览器启动验证</body></html>');
   if(await page.locator('body').textContent()!=='Huisurvey CI 浏览器启动验证')throw new Error('Browser rendering failed');
   await browser.close();
   const binary=realpathSync(server.process().spawnargs[0]);
   writeFileSync(manifest,JSON.stringify({version,platform:platform(),arch:arch(),engine,binary,binarySha256:createHash('sha256').update(readFileSync(binary)).digest('hex')})+'\n',{mode:0o600});
  }finally{await server.close();}
  console.log(JSON.stringify({engine,version,cacheHit:usable,startRenderExit:'PASS',cache}));
 }
 if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,'PLAYWRIGHT_BROWSERS_PATH='+cache+'\nPLAYWRIGHT_SKIP_BROWSER_GC=1\n');
}
