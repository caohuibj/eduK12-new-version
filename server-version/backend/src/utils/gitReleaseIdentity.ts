// Reserved audit identity. This UUID is public and cannot authenticate a request.
export const GIT_RELEASE_ACTOR_ID = '5ca1e001-89a3-4adc-b219-3ded222b7121'
export const GIT_RELEASE_USERNAME = 'SYSTEM_GIT_RELEASE'

export function isGitReleaseAccount(id: string, username: string) {
  return id === GIT_RELEASE_ACTOR_ID || username === GIT_RELEASE_USERNAME
}
