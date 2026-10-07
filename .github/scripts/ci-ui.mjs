import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { requireFreePort } from './runner-preflight.mjs';
const [kind, engine = 'chromium'] = process.argv.slice(2);
if (!['canonical','app-shell'].includes(kind) || !['chromium','firefox','webkit','all'].includes(engine)) throw new Error('Invalid UI scenario');
if (kind === 'app-shell' && engine !== 'chromium') throw new Error('AppShell requires Chromium');
const root = process.env.GITHUB_WORKSPACE;
if (process.env.CI !== 'true' || !root || !process.env.RUNNER_TEMP) throw new Error('UI runner requires Actions paths');
const evidence = join(process.env.RUNNER_TEMP,`eduk12-ui-${process.env.GITHUB_RUN_ID}-${engine}`,kind);
mkdirSync(evidence,{recursive:true});
await requireFreePort(5173);
const children = new Set();
function stop(child) { if (child.exitCode === null && child.signalCode === null) { try { process.kill(-child.pid,'SIGTERM'); } catch(e) { if(e.code !== 'ESRCH') throw e; } } }
const stopAll = () => { for (const child of children) stop(child); };
process.once('SIGTERM', () => { stopAll(); process.exit(143); });
process.once('SIGINT', () => { stopAll(); process.exit(130); });
const fd = openSync(join(evidence,'preview.log'),'w');
const preview = spawn(process.execPath,[join(root,'server-version/frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5173','--strictPort'],{
  cwd:join(root,'server-version/frontend'),env:process.env,stdio:['ignore',fd,fd],detached:true,
});
children.add(preview); closeSync(fd);
const env = {...process.env, PLAYWRIGHT_CORE_PATH:join(root,'ci/browser/node_modules/playwright-core'),
  VISUAL_QA_BASE_URL:'http://127.0.0.1:5173',APP_SHELL_BASE_URL:'http://127.0.0.1:5173',
  VISUAL_QA_BROWSER_ENGINE:engine,VISUAL_QA_EVIDENCE_DIR:evidence,APP_SHELL_EVIDENCE_DIR:evidence};
try {
  let ready=false;
  for(let i=0;i<120;i++) {
    if(preview.exitCode !== null) throw new Error(`Preview exited ${preview.exitCode}`);
    try { if((await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(1000)})).ok) {ready=true;break;} } catch {}
    await delay(250);
  }
  if(!ready) throw new Error('Frontend preview readiness failed');
  const engines = engine === 'all' ? ['chromium','firefox','webkit'] : [engine];
  const scripts = kind === 'app-shell' ? [{file:'app-shell-browser-e2e.cjs',engine:'chromium'}] : engines.flatMap(browser => [
    ...(browser === 'chromium' ? ['visual-canonical-browser-e2e.cjs','visual-staff-complex-browser-e2e.cjs','visual-classroom-control-browser-e2e.cjs'] : []),
    'visual-interaction-states-browser-e2e.cjs','visual-legacy-dialogs-browser-e2e.cjs','qa-round5-more-actions-browser-e2e.cjs','qa-round5-anonymous-browser-e2e.cjs','qa-round5-sjt-upload-browser-e2e.cjs',
  ].map(file => ({file,engine:browser})));
  for(const item of scripts) {
    const script=item.file;
    const scenarioEnv={...env,VISUAL_QA_BROWSER_ENGINE:item.engine,VISUAL_QA_EVIDENCE_DIR:join(evidence,item.engine)};
    mkdirSync(scenarioEnv.VISUAL_QA_EVIDENCE_DIR,{recursive:true});
    console.log(`::group::${item.engine} / ${script}`);
    await new Promise((accept,reject) => {
      const child=spawn(process.execPath,[join(root,'server-version/e2e',script)],{cwd:join(root,'server-version'),env:scenarioEnv,stdio:'inherit',detached:true});
      children.add(child);
      child.once('error',reject);
      child.once('close',(code,signal)=> {children.delete(child); code === 0 ? accept() : reject(new Error(`${script}: exit ${code}, signal ${signal}`));});
    });
    console.log('::endgroup::');
  }
} finally {
  stopAll();
  for(let i=0;i<20 && preview.exitCode === null && preview.signalCode === null;i++) await delay(100);
  if(preview.exitCode === null && preview.signalCode === null) { try {process.kill(-preview.pid,'SIGKILL');} catch(e) {if(e.code !== 'ESRCH') throw e;} }
}
