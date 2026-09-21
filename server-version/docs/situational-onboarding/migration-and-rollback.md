# Migration, compatibility and rollback

The three existing production keys, versions, definitions, scoring bindings, golden expected results, runner/report definitions and compiled hashes match `onboarding-baseline.json` captured before edits. Their old TS modules are compatibility exports of the owned JSON; the generated registry is the single production content source. Original catalog order is explicit data.

The registry and standalone catalog now expose the actual V1/V2 union, replacing the old V2-as-V1 cast. The generic catalog uses the already-existing runnerSituationRuntimeDefinition. No new execution algorithm or frontend component is added.

Real PostgreSQL unknown-task tests found that getUnifiedCompositeAttemptState rechecked live publication even for frozen attempts. PR1 removes that re-admission check only on this frozen read path, retaining authorization, runtime generation and frozen slot integrity checks. New Bundle admission retains the current publication/capability checks. Legacy PILOT admission/projection remains PR2 scope.

Stop new admission by retiring an exact source while retaining its receipt/content. Do not delete a used identity or scorer. Test resume, terminal FINAL replay, history/report and Bundle frozen-state reads before rollout. Do not revert to a build that cannot read an already-used new identity: retain compatible readers/static history or forward-fix. No database migration, rescoring or historical result rewrite is part of PR1.

For legacy test fixtures, the existing explicit environment flags remain available through a separate fixture adapter outside production discovery. They are test deployment configuration, not ordinary production source files.

Browser evidence uses an isolated PostgreSQL/Redis environment. The old text pilot E2E is aligned with the already-merged AssessmentShell labels; the video fixture permits an explicit local audio encoder override, retaining libvorbis as its default. Neither change modifies participant behavior.
