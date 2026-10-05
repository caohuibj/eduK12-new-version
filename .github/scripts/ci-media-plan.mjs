import { pathToFileURL } from 'node:url';
export const mediaGroups = { 'images-video':['media2','video_core'], 'cognitive-situational':['media7','situational_video','situational_branching'] };
export function mediaPlan(selected) {
  if(!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
    || selected.some(x => !Object.values(mediaGroups).flat().includes(x))) throw new Error('Invalid selected media scenarios');
  return Object.keys(mediaGroups).filter(group => mediaGroups[group].some(x=>selected.includes(x)));
}
export function validateMediaPlan(selected, groups) {
  if(JSON.stringify(mediaPlan(selected)) !== JSON.stringify(groups)) throw new Error('Media groups do not cover the selected scenarios');
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  validateMediaPlan(JSON.parse(process.env.CI_MEDIA_SELECTED),JSON.parse(process.env.CI_MEDIA_GROUPS));
