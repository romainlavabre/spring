// Finds the workspace a command works on.
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { WORKSPACE_FILE } from '../core/layout/workspace'

export function findWorkspaceRoot(from: string): string | null {
  let dir = existsSync(from) && statSync(from).isFile() ? dirname(from) : from
  for (;;) {
    if (existsSync(resolve(dir, WORKSPACE_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export class UsageError extends Error {}
