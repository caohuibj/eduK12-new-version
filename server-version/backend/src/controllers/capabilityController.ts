import { Request, Response } from 'express'
import { config } from '../config'
import { success } from '../utils/response'

/**
 * Runtime feature capabilities. The backend is the source of truth so clients
 * do not need a separately maintained build-time Cognitive flag.
 */
export const capabilityController = {
  getCapabilities(_req: Request, res: Response) {
    return success(res, {
      cognitive: config.cognitiveModuleEnabled,
    })
  },
}
