import { spawnSync } from 'node:child_process';

/** Remove only this invocation's temporary container and its anonymous volumes. */
export function cleanupRestoreContainer(container, runner = spawnSync) {
  if (!/^eduk12-restore-[a-f0-9]{12}$/.test(container)) throw new Error('invalid temporary restore container');
  const result = runner('docker', ['rm', '--force', '--volumes', container], {
    stdio: 'ignore', timeout: 30_000,
  });
  return !result.error && result.status === 0;
}
