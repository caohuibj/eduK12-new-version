export class CampusAdmissionError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 409) {
    super(code); this.name = 'CampusAdmissionError'
  }
}
