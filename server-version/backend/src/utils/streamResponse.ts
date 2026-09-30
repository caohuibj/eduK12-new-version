import { pipeline, type Readable } from 'node:stream'
import type { Response } from 'express'

/** pipeline owns both ends: source errors, response errors and early client
 * disconnects terminate only this request and release its file/upstream stream. */
export function streamResponse(source: Readable, response: Response): Response {
  pipeline(source, response, () => {
    // pipeline already destroys both ends on failure. Never throw an async
    // delivery error into the process-level uncaughtException handler.
  })
  return response
}
