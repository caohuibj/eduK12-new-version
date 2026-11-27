import type {AdminSessionProof} from '../../modules/admin-permissions/proof'

export const trainingAdminProof=(age=0):AdminSessionProof=>({
 adminVerifiedAt:Math.floor(Date.now()/1000)-age,adminSessionId:'synthetic-training-admin-session',
 adminAuthenticationMethod:'TOTP',tokenVersion:0,
})
