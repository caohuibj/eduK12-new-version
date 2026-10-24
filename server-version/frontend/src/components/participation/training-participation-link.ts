import {createParticipationLinkCodec} from './participation-link'
export const trainingStudyLink=createParticipationLinkCodec({route:'/public/studies/',namespace:'training-study',proofFields:{key:/^[A-Za-z0-9_-]{43}$/}})
export const trainingAttemptLink=createParticipationLinkCodec({route:'/public/composite/attempts/',namespace:'training-attempt',proofFields:{key:/^[A-Za-z0-9_-]{20,200}$/}})
export const trainingCognitiveLink=createParticipationLinkCodec({route:'/public/cognitive/sessions/',namespace:'training-cognitive',proofFields:{key:/^[A-Za-z0-9_-]{20,200}$/}})
