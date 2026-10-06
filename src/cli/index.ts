// Command line interface: the MCP server, PDF export and page validation.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { formatIssues } from '../core/blocks/validate'
import { DocStore } from '../core/layout/store'
import { flattenTree } from '../core/tree'
import { createMcpServer } from '../mcp/server'
import { findWorkspaceRoot, UsageError } from './workspace'

export interface CliIo {
  stdout(text: string): void
  stderr(text: string): void
  cwd: string
  env: Record<string, string | undefined>
  /** Colors on the terminal. */
  color: boolean
  version: string
  /** Prints a page or a section to a PDF file (app binary only: it needs Chromium). */
  exportPdf?(root: string, path: string, file: string): Promise<void>
}

export const COMMANDS = ['mcp', 'export', 'validate', 'help', 'version', '--help', '-h', '--version', '-v']

const HELP = `Spring — beautiful documentation kept in git workspaces

Usage:
  spring                                Open the app
  spring mcp [--workspace <folder>]     MCP server on stdio, for AI assistants
  spring export <path> -o <file.pdf> [--workspace <folder>]
                                        Export a page or a section as PDF, e.g.
                                        spring export infra/kubernetes -o k8s.pdf
                                        ("" exports the whole workspace)
  spring validate [--workspace <folder>]
                                        Check every page: shape, ids, timelines,
                                        links to pages and images (exit code 1 on issues)
  spring help                           Show this help

  Commands work on the workspace of the current folder, or of --workspace <folder>.
`

function workspaceRoot(option: string | undefined, io: CliIo): string {
  const root = findWorkspaceRoot(resolve(io.cwd, option ?? '.'))
  if (!root) throw new UsageError('Not inside a Spring workspace: run it from a workspace folder or pass --workspace <folder>')
  return root
}

async function exportCommand(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { output: { type: 'string', short: 'o' }, workspace: { type: 'string' } }
  })
  if (positionals.length !== 1 || !values.output) throw new UsageError('spring export <page or section path> -o <file.pdf>')
  if (!io.exportPdf) throw new UsageError('PDF export needs the Spring app: run the "spring" command installed with it')
  const root = workspaceRoot(values.workspace, io)
  const path = positionals[0].replace(/^sections\//, '').replace(/\.page\.json$/, '').replace(/\/+$/, '')
  const file = resolve(io.cwd, values.output)
  await io.exportPdf(root, path, file)
  io.stdout(`PDF written to ${file}\n`)
  return 0
}

async function validateCommand(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({ args, options: { workspace: { type: 'string' } } })
  const store = new DocStore(workspaceRoot(values.workspace, io))
  let failed = 0
  let count = 0
  for (const node of flattenTree(store.tree())) {
    if (node.kind !== 'page') continue
    count++
    let raw: unknown
    try {
      raw = JSON.parse(store.readPageSource(node.path))
    } catch (error) {
      failed++
      io.stderr(`✗ ${node.path}: not valid JSON (${(error as Error).message})\n`)
      continue
    }
    const result = store.validate(raw)
    if (result.ok) continue
    failed++
    io.stderr(`✗ ${node.path}\n${formatIssues(result.issues).replace(/^/gm, '    ')}\n`)
  }
  io.stdout(failed ? `${failed} of ${count} pages have issues\n` : `${count} pages, all valid\n`)
  return failed ? 1 : 0
}

/** Serves MCP on stdin/stdout until the client disconnects. */
async function mcpCommand(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({ args, options: { workspace: { type: 'string' } } })
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const server = createMcpServer({
    workspace: values.workspace ? resolve(io.cwd, values.workspace) : undefined,
    env: io.env,
    version: io.version
  })
  const transport = new StdioServerTransport()
  const closed = new Promise<void>((done) => {
    transport.onclose = () => done()
    process.stdin.on('end', () => done())
  })
  await server.connect(transport)
  await closed
  return 0
}

/** Runs a command; returns the process exit code. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...args] = argv
  try {
    switch (command) {
      case 'mcp':
        return await mcpCommand(args, io)
      case 'export':
        return await exportCommand(args, io)
      case 'validate':
        return await validateCommand(args, io)
      case 'version':
      case '--version':
      case '-v':
        io.stdout(`${io.version}\n`)
        return 0
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        io.stdout(HELP)
        return 0
      default:
        throw new UsageError(`Unknown command "${command}"`)
    }
  } catch (error) {
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.stderr(`spring: ${(error as Error).message}\nRun "spring help" for usage.\n`)
      return 2
    }
    io.stderr(`spring: ${(error as Error).message}\n`)
    return 1
  }
}
