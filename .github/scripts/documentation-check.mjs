import { execFileSync } from 'node:child_process';
import { changedEntries, classifyChanges } from './content-scope.mjs';
const base=process.env.CI_BASE_SHA;
if(!classifyChanges(changedEntries(base)).documentation) throw new Error('Documentation scope mismatch');
execFileSync('git',['diff','--check',base,'HEAD'],{stdio:'inherit'});
