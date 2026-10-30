import React from 'react'
import {createRoot} from 'react-dom/client'
import {TrainingGroupReports} from '../frontend/src/training/TrainingGroupReports'
createRoot(document.getElementById('root')!).render(<main><TrainingGroupReports courseId="course" /></main>)
