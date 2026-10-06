// Shared fixtures of the unit tests: temporary folders, git identity and app users.
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SyncStatus } from '@shared/types'
import { WorkspaceManager } from '../../src/main/workspace/manager'

export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
}

export function tempRoot(prefix = 'spring-'): string {
  process.env.GIT_AUTHOR_NAME = 'Test'
  process.env.GIT_AUTHOR_EMAIL = 'test@example.com'
  process.env.GIT_COMMITTER_NAME = 'Test'
  process.env.GIT_COMMITTER_EMAIL = 'test@example.com'
  return mkdtempSync(join(tmpdir(), prefix))
}

export function bareRemote(root: string, name = 'remote.git', branch = 'master'): string {
  const remote = join(root, name)
  execFileSync('git', ['init', '--bare', `--initial-branch=${branch}`, remote])
  return remote
}

export interface TestUser {
  ws: WorkspaceManager
  statuses: SyncStatus[]
}

/** A user of the app: own registry and clones folder. */
export function user(root: string, name: string): TestUser {
  const statuses: SyncStatus[] = []
  const ws = new WorkspaceManager(
    join(root, name, 'state.json'),
    join(root, name, 'workspaces'),
    { status: (s) => statuses.push(s), changed: () => undefined },
    0
  )
  return { ws, statuses }
}
