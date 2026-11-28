import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { gitContentReleaseSelector } from './git-content-release-scope.mjs'

/** Check just the affected release selectors using the caller's reviewed diff base. */
export function checkChangedGitContentReleases(base, execute = execFileSync) {
  if (!/^[a-f0-9]{40}$/.test(base) || /^0{40}$/.test(base)) {
    throw new Error('An exact Git content base commit is required')
  }
  const paths = execute('git', ['diff', '--no-ext-diff', '--no-textconv', '--no-renames',
    '--name-only', '-z', base, 'HEAD', '--'], { encoding: 'utf8' }).split('\0')
  const selectors = [...new Set(paths.map(gitContentReleaseSelector).filter(Boolean))].sort()
  if (selectors.length) execute('npm', ['run', 'content:check', '--', ...selectors], { stdio: 'inherit' })
  return selectors
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkChangedGitContentReleases(process.argv[2])
}
