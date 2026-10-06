// zod schemas validating every IPC payload coming from the renderer. Pages,
// sections and links are validated again, against the workspace, by the store.
import { z } from 'zod'
import type { Api } from '@shared/api'
import { linkSchema, sectionSchema } from '@core/blocks/schema'

const none = z.undefined().or(z.object({}).strict())
const repoId = z.string().min(1)
const name = z.string().trim().min(1).max(200)
// Checked again segment by segment by the store.
const path = z.string().max(1000)
const nodePath = path.min(1)
// The page is validated in depth by the store, which reports every issue with its path.
const page = z.object({ title: z.string(), blocks: z.array(z.unknown()) }).passthrough()

export const schemas: { [D in keyof Api]: { [M in keyof Api[D]]: z.ZodType } } = {
  workspace: {
    state: none,
    clone: z.object({ name, remoteUrl: z.string().trim().min(1), path: z.string().optional() }),
    open: z.object({ name, path: z.string().min(1) }),
    create: z.object({ name, path: z.string().optional() }),
    rename: z.object({ repoId, name }),
    remove: z.object({ repoId, deleteFiles: z.boolean() }),
    activate: z.object({ repoId }),
    setRemote: z.object({ repoId, remoteUrl: z.string().trim().min(1) }),
    status: z.object({ repoId }),
    sync: z.object({ repoId }),
    resolveConflicts: z.object({ repoId, choices: z.record(z.string(), z.enum(['mine', 'theirs'])) })
  },
  docs: {
    tree: none,
    getPage: z.object({ path: nodePath }),
    getPageSource: z.object({ path: nodePath }),
    createPage: z.object({ parent: path, page }),
    savePage: z.object({ path: nodePath, page }),
    savePageSource: z.object({ path: nodePath, source: z.string().max(5_000_000) }),
    duplicatePage: z.object({ path: nodePath }),
    validate: z.object({ page: z.unknown() }),
    getSection: z.object({ path }),
    createSection: z.object({ parent: path, section: sectionSchema }),
    saveSection: z.object({ path: nodePath, section: sectionSchema }),
    getLink: z.object({ path: nodePath }),
    createLink: z.object({ parent: path, link: linkSchema }),
    saveLink: z.object({ path: nodePath, link: linkSchema }),
    remove: z.object({ path: nodePath }),
    move: z.object({ from: nodePath, parent: path, before: nodePath.nullable() }),
    search: z.object({ query: z.string().max(500) }),
    theme: none
  },
  assets: {
    list: none,
    add: z.object({ name: z.string().min(1).max(200), base64: z.string().max(40_000_000) }),
    pick: none
  },
  exporter: {
    pdf: z.object({ path })
  },
  print: {
    job: z.object({ token: z.string().min(1) })
  },
  dialog: {
    openDirectory: z.object({ title: z.string() })
  },
  app: {
    info: none,
    close: none,
    openExternal: z.object({ url: z.string().regex(/^(https?|mailto):/i, 'Only web and mail links open outside') })
  },
  update: {
    status: none,
    install: none,
    openTerminal: none,
    restart: none
  }
}
