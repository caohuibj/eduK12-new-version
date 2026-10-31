export type GroupHistoryCursor={artifactId:string;generatedAt:string}
export type GroupHistoryPage={artifacts:GroupHistoryCursor[];nextCursor?:GroupHistoryCursor|null}
export const groupHistoryQuery=(before:GroupHistoryCursor)=>'?'+new URLSearchParams({beforeGeneratedAt:before.generatedAt,beforeArtifactId:before.artifactId})
export function mergeGroupHistory<T extends GroupHistoryCursor>(existing:T[],next:T[]):T[]{return [...new Map([...existing,...next].map(pointer=>[pointer.artifactId,pointer])).values()]}
