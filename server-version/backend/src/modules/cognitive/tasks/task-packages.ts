import { bartTaskPackage } from './bart/package'
import { cardsortTaskPackage } from './cardsort/package'
import { corsiTaskPackage } from './corsi/package'
import { cptTaskPackage } from './cpt/package'
import { digitbackwardTaskPackage } from './digitbackward/package'
import { emotionrecognitionTaskPackage } from './emotionrecognition/package'
import { fakeTaskPackage } from './fake/package'
import { flankerTaskPackage } from './flanker/package'
import { gonogoTaskPackage } from './gonogo/package'
import { lexicaldecisionTaskPackage } from './lexicaldecision/package'
import { matrixTaskPackage } from './matrix/package'
import { memoryTaskPackage } from './memory/package'
import { mentalrotationTaskPackage } from './mentalrotation/package'
import { nbackTaskPackage } from './nback/package'
import { pairedassociateTaskPackage } from './pairedassociate/package'
import { patterncompareTaskPackage } from './patterncompare/package'
import { picturesequenceTaskPackage } from './picturesequence/package'
import { reactionTaskPackage } from './reaction/package'
import { reversallearningTaskPackage } from './reversallearning/package'
import { sstTaskPackage } from './sst/package'
import { stroopTaskPackage } from './stroop/package'
import { taskswitchTaskPackage } from './taskswitch/package'
import { towerTaskPackage } from './tower/package'
import { trailmakingTaskPackage } from './trailmaking/package'
import { wordlistTaskPackage } from './wordlist/package'

export const COGNITIVE_TASK_PACKAGES = [
  bartTaskPackage,
  cardsortTaskPackage,
  corsiTaskPackage,
  cptTaskPackage,
  digitbackwardTaskPackage,
  emotionrecognitionTaskPackage,
  fakeTaskPackage,
  flankerTaskPackage,
  gonogoTaskPackage,
  lexicaldecisionTaskPackage,
  matrixTaskPackage,
  memoryTaskPackage,
  mentalrotationTaskPackage,
  nbackTaskPackage,
  pairedassociateTaskPackage,
  patterncompareTaskPackage,
  picturesequenceTaskPackage,
  reactionTaskPackage,
  reversallearningTaskPackage,
  sstTaskPackage,
  stroopTaskPackage,
  taskswitchTaskPackage,
  towerTaskPackage,
  trailmakingTaskPackage,
  wordlistTaskPackage,
] as const
