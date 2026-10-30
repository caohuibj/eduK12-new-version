// A bounded use of the existing Draft compile/type jobs. This grants no Ready
// qualification and does not alter the platform's migration/security gates.
const backend='server-version/backend/';
const frontend='server-version/frontend/src/';
const markers=new Set([backend+'src/modules/reporting/personal-tracking.ts',backend+'src/modules/survey/personal-tracking.ts',backend+'src/modules/composite/personal-tracking.ts']);
const allowed=new Set([
  ...['prisma/schema.prisma','prisma/migrations/20261030100000_survey_personal_tracking/migration.sql',
    'prisma/migrations/20261030100500_survey_personal_tracking_guards/migration.sql',
    'src/modules/reporting/personal-tracking.ts','src/modules/survey/personal-tracking.ts',
    'src/modules/survey/personal-tracking.service.ts','src/modules/survey/tracking-source.ts',
    'src/modules/survey/participant-feedback.ts','src/modules/survey/measurement.result.ts',
    'src/modules/survey/public.routes.ts','src/modules/survey/publication.service.ts','src/modules/survey/waves.publish.ts',
    'src/modules/survey/waves.routes.ts','src/modules/survey/waves.service.ts',
    'src/__tests__/reporting/personal-tracking.test.ts','src/__tests__/survey/personal-tracking.postgres.integration.test.ts',
    'src/__tests__/measurement-content/survey-content-selection.test.ts',
    'prisma/migrations/20261030110000_training_personal_tracking/migration.sql',
    'src/modules/composite/personal-tracking.ts','src/modules/composite/personal-tracking.service.ts',
    'src/modules/composite/personal-tracking-results.ts','src/modules/composite/composite.service.ts',
    'src/modules/composite/composite.routes.ts','src/modules/composite/training-content-binding.ts',
    'src/modules/composite/training-metric-disclosure.ts','src/modules/questionnaire-product/service.ts',
    'src/modules/questionnaire-product/routes.ts','src/modules/anonymous-study/service.ts',
    'src/modules/anonymous-study/routes.ts','src/modules/bundle-product/service.ts','src/modules/bundle-product/routes.ts',
    'src/__tests__/reporting/training-personal-tracking.test.ts',
    'src/__tests__/integration/trainingPersonalTracking.postgres.integration.test.ts',
    'src/__tests__/measurement-content/training-metric-disclosure.test.ts',
  ].map(path=>backend+path),
  ...['modules/reporting/PersonalChangesReport.tsx','modules/reporting/longitudinalVisualization.ts',
    'modules/reporting/__tests__/PersonalChangesReport.test.tsx','survey/SurveyPersonalChanges.tsx',
    'survey/SurveyPublicApp.tsx','survey/SurveyWaveStudio.tsx','survey/SurveyWaveStudio.tracking.test.tsx',
    'modules/composite/TrainingPersonalChanges.tsx','modules/composite/CompositeReportPage.tsx',
    'modules/composite/__tests__/TrainingPersonalChanges.test.tsx','api/anonymousStudy.ts',
    'pages/questionnaire/QuestionnaireProducts.tsx','pages/public/AnonymousStudyPage.tsx','pages/bundle/BundleProducts.tsx',
  ].map(path=>frontend+path),
  '.github/scripts/personal-tracking-draft-scope.mjs','.github/scripts/personal-tracking-ready.mjs','.github/scripts/personal-tracking-ready.json','.github/scripts/personal-tracking-ready.test.mjs','docs/release/README.md','.github/scripts/content-scope.mjs',
  '.github/scripts/content-scope.test.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml',
  'docs/development/personal-longitudinal-survey-20261030.md',
  'docs/development/personal-longitudinal-training-20261030.md',
]);
export function personalTrackingDraftScope(entries,{event,draft,forceFull=false}={}){
  if(event!=='pull_request'||draft!==true||!entries.some(entry=>markers.has(entry.file)))return false;
  if(forceFull)throw new Error('Personal tracking Draft does not authorize full-platform execution');
  if(!entries.every(entry=>entry.newMode==='100644'&&
    (entry.status==='A'&&entry.oldMode==='000000'||entry.status==='M'&&entry.oldMode==='100644')&&
    (allowed.has(entry.file)||/^docs\/evidence\/personal-longitudinal-(?:20261030|training-20261030)\/(?:(?:originals|continuation)\/)?[a-zA-Z0-9_.-]+\.(?:json|log|png)$/.test(entry.file))))
    throw new Error('Personal tracking Draft has unplanned paths or modes; no broad fallback');
  return true;
}
