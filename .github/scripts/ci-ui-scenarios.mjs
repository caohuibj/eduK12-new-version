export const CHROMIUM_SCREENSHOTS=Object.freeze(['visual-canonical-browser-e2e.cjs','visual-staff-complex-browser-e2e.cjs','visual-classroom-control-browser-e2e.cjs']);
export const INTERACTIONS=Object.freeze(['visual-interaction-states-browser-e2e.cjs','visual-legacy-dialogs-browser-e2e.cjs']);
export const ROUND5=Object.freeze(['qa-round5-more-actions-browser-e2e.cjs','qa-round5-anonymous-browser-e2e.cjs','qa-round5-sjt-upload-browser-e2e.cjs','qa-round5-workbench-browser-e2e.cjs']);
export function uiScenarios(kind,engine,group='all'){
 if(!['chromium','firefox','webkit','all'].includes(engine))throw new Error('Invalid browser engine');
 if(kind==='app-shell'){
  if(engine!=='chromium'||group!=='all')throw new Error('AppShell requires Chromium and its complete suite');
  return [{file:'app-shell-browser-e2e.cjs',engine}];
 }
 if(kind!=='canonical'||!['all','screenshots','interactions','round5'].includes(group))throw new Error('Invalid UI scenario group');
 if(group==='screenshots'&&engine!=='chromium')throw new Error('Canonical screenshot suite requires Chromium');
 return (engine==='all'?['chromium','firefox','webkit']:[engine]).flatMap(browser=>[
  ...(['all','screenshots'].includes(group)&&browser==='chromium'?CHROMIUM_SCREENSHOTS:[]),
  ...(['all','interactions'].includes(group)?INTERACTIONS:[]),
  ...(['all','round5'].includes(group)?ROUND5:[]),
 ].map(file=>({file,engine:browser})));
}
