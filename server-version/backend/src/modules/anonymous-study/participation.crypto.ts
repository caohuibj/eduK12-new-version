import {createParticipationCodeCrypto} from '../participation/code-crypto'
export {normalizeShortCode,validShortCode,parseMemorableCode,codeCredentialHash} from '../participation/code-crypto'
export const {memorableCredential,resetCodeHash,generateStudyCode,normalizeGeneratedCode,generatedCodeLookup}=
 createParticipationCodeCrypto('TRAINING_PARTICIPATION_V1','HT2','T','training_participation_credential')
