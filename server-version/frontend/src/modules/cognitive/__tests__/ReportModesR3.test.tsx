import {reportRevision as matrix} from '../../../../../backend/src/modules/cognitive/tasks/matrix/report-review-20261101'
import {reportRevision as mentalrotation} from '../../../../../backend/src/modules/cognitive/tasks/mentalrotation/report-review-20261101'
import {reportRevision as tower} from '../../../../../backend/src/modules/cognitive/tasks/tower/report-review-20261101'
import {reportRevision as lineangle} from '../../../../../backend/src/modules/cognitive/tasks/lineangle/report-review-20261101'
import {reportRevision as embeddedfigures} from '../../../../../backend/src/modules/cognitive/tasks/embeddedfigures/report-review-20261101'
import {reportRevision as icarmatrix} from '../../../../../backend/src/modules/cognitive/tasks/icarmatrix/report-review-20261101'
import {reportRevision as wordanalogy} from '../../../../../backend/src/modules/cognitive/tasks/wordanalogy/report-review-20261101'
import {reportRevision as wordmeaning} from '../../../../../backend/src/modules/cognitive/tasks/wordmeaning/report-review-20261101'
import {reportRevision as wordproblem} from '../../../../../backend/src/modules/cognitive/tasks/wordproblem/report-review-20261101'
import {reportRevision as logicdeduce} from '../../../../../backend/src/modules/cognitive/tasks/logicdeduce/report-review-20261101'
import {reportRevision as seriescomplete} from '../../../../../backend/src/modules/cognitive/tasks/seriescomplete/report-review-20261101'
import {reportRevision as readingcomp} from '../../../../../backend/src/modules/cognitive/tasks/readingcomp/report-review-20261101'
import {reportRevision as proofread} from '../../../../../backend/src/modules/cognitive/tasks/proofread/report-review-20261101'
import {reportRevision as cogest} from '../../../../../backend/src/modules/cognitive/tasks/cogest/report-review-20261101'
import {afterEach,it,expect} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import CognitiveV2ReportCard from '../CognitiveV2ReportCard'
import type {CognitiveV2Report} from '../types'
afterEach(cleanup)
const revisions={matrix,mentalrotation,tower,lineangle,embeddedfigures,icarmatrix,wordanalogy,wordmeaning,wordproblem,logicdeduce,seriescomplete,readingcomp,proofread,cogest}
const tasks=['matrix','mentalrotation','tower','lineangle','embeddedfigures','icarmatrix','wordanalogy','wordmeaning','wordproblem','logicdeduce','seriescomplete','readingcomp','proofread','cogest']
it.each(tasks)('%s renders the revised concept and everyday example through the real report card',async task=>{
 const p=revisions[task as keyof typeof revisions]
 const reading=p.reportReading!
 const report:CognitiveV2Report={schemaVersion:2,title:p.title,profileLabel:'体验版',qualityState:'interpretable',conclusion:'本次记录：0%。',headline:[],user:[],detail:[],quality:[],method:{testType:task,engineVersion:p.engineVersion,scoringVersion:p.scoringVersion,configVersion:'synthetic-report-copy',protocolSignature:'template-only',profile:'experience'},disclaimer:p.disclaimer,practicalTips:p.practicalTips,
  reading:{schemaVersion:2,reportVersion:reading.version,presentationVersion:p.presentationVersion,title:reading.title,introduction:reading.introduction,
   interpretation:{state:'available',reasons:[],withheldMetricKeys:[]},feedback:{summary:'本次记录：0%。',evidenceMetricKeys:[],nextStep:reading.nextStep},caveats:[p.disclaimer],visuals:[],popular:reading.popular,professional:{construct:reading.professional!.construct,procedure:reading.professional!.procedure,interpretation:reading.professional!.interpretation,confounders:reading.professional!.confounders,parameters:[],metrics:[],quality:[],withheld:[]}}}
 render(<CognitiveV2ReportCard report={report}/> )
 expect(screen.getByRole('heading',{name:reading.title})).toBeInTheDocument()
 expect(screen.getByText(reading.popular!.concept)).toBeVisible()
 expect(screen.getByText(reading.popular!.example)).toBeVisible()
 expect(screen.getByText('本次记录：0%。')).toBeVisible()
 expect(screen.queryByText('0 ms')).not.toBeInTheDocument()
})
