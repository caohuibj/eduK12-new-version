// Follow source block order observed in official run 39929555175 CSS.
// Await each real stylesheet before the next; writer verifies emitted mapDeps.
export async function loadEntryCss(){
 await import('@source/components/product-ui/product-ui.css')
 await import('@source/modules/assessment-media/material-picker.css')
 await import('@source/pages/ScaleEdit.css')
 await import('@source/survey/survey-form-studio.css')
 await import('@source/survey/survey-image-field.css')
 await import('@source/modules/reporting/report-ui.css')
 await import('@source/components/education-tools/education-private-tools.css')
 await import('@source/modules/assessment-core/composition/selected-tool-outline.css')
 await import('@source/components/education-tools/education-personal-report.css')
 await import('@source/components/report-privacy/report-privacy.css')
 await import('@source/components/product-theme/product-theme.css')
 await import('@source/training/training-form-surface.css')
 await import('@source/modules/cognitive/tasks/shared/cognitive-task-presentation.css')
 await import('@source/modules/cognitive/tasks/matrix/matrix-layout.css')
 await import('@source/school/school.css')
 await import('@source/school/school-workspace.css')
 await import('@source/school/school-landing.css')
 await import('@source/school/school-theme.css')
}
