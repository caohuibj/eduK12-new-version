import React from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter, Route, Routes} from 'react-router-dom'
import TrainingTrainerCourse from '../frontend/src/training/TrainingTrainerCourse'
createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes>
  <Route path="/courses/:courseId/detail" element={<TrainingTrainerCourse />} />
</Routes></BrowserRouter>)
