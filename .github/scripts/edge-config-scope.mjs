import {execFileSync} from 'node:child_process';
const nginx='server-version/frontend/nginx.conf', compose='server-version/docker-compose.yml';
const controls=new Set(['.github/workflows/ci.yml','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/scripts/edge-config-scope.mjs','.github/scripts/edge-config.test.mjs','.github/scripts/edge-config-smoke.sh']);
export function edgeConfigScope(entries,readBase,readHead){
 if(!entries.some(e=>e.file===nginx)||entries.some(e=>!['A','M'].includes(e.status)||e.newMode!=='100644'||(e.oldMode!=='100644'&&e.oldMode!=='000000')||![nginx,compose].includes(e.file)&&!controls.has(e.file)))return false;
 if(entries.some(e=>e.file===compose)){
  const before=readBase(compose),after=readHead(compose);
  // This route permits only the frontend nofile addition, not arbitrary Compose edits.
  if(typeof before!=='string'||typeof after!=='string'||after.replace(/(?<=    container_name: ptool-frontend\n)    ulimits:\n      nofile:\n        soft: 65535\n        hard: 65535\n/,'')!==before)return false;
 }
 return true;
}
export function readEdgeScope(base,head='HEAD'){
 const out=execFileSync('git',['diff','--raw','--no-renames','--no-abbrev','-z',base,head],{encoding:'utf8'}).split('\0');const entries=[];
 for(let i=0;i<out.length-1;i+=2){const m=/^:(\d{6}) (\d{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMDT])$/.exec(out[i]);if(!m)return false;entries.push({file:out[i+1],oldMode:m[1],newMode:m[2],status:m[3]});}
 const read=ref=>file=>{try{return execFileSync('git',['show',ref+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{return null;}};
 return edgeConfigScope(entries,read(base),read(head));
}
export function edgeConfigOutputs(){
 const flags=['maintenance','content','presentation','frontend','frontend_test','documentation','frontend_build','ui_required','visual_hosted','scale','scale_intake_light','cognitive_intake_light','cognitive','situational','bundle','codeql','media2','video_core','media7','situational_video','situational_branching','app_shell','canonical_visual','perf_smoke','ops'];
 return {...Object.fromEntries(flags.map(k=>[k,false])),application_route:'edge-config',scenario:'edge-config',runner_profile:'hosted',media_selection:'[]',media_groups:'[]',light_runner:'["ubuntu-24.04"]'};
}
