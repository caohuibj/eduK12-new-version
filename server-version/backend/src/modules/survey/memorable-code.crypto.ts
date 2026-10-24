// Survey adapter: preserve existing persisted credentials and generated-code format.
import {createParticipationCodeCrypto} from '../participation/code-crypto'
export {normalizeShortCode,validShortCode,parseMemorableCode,codeCredentialHash} from '../participation/code-crypto'
export const {codeKey,memorableCredential,resetCodeHash,generateStudyCode,normalizeGeneratedCode,generatedCodeLookup}=
 createParticipationCodeCrypto('SURVEY_MEMORABLE_V1','HS2','S','survey_memorable_credential')
