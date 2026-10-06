// Electron entry point: window, IPC registration and services.
import { join, resolve } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import type { ZodType } from 'zod'
import { API_METHODS, type Api, type ApiEvents } from '@shared/api'
import type { WorkspaceState } from '@shared/types'
import { COMMANDS, runCli } from '../cli/index'
import { AssetRoots, registerAssetScheme } from './assets'
import { PdfExporter } from './export'
import { createHandlers } from './ipc/handlers'
import { schemas } from './ipc/schemas'
import { JsonStore } from './jsonStore'
import { Updater } from './update'
import { ContentService } from './workspace/content'
import { WorkspaceManager } from './workspace/manager'
import { WorkspaceWatcher } from './workspace/watcher'

// Keeps the data folder name stable (~/.config/spring) whatever the product name.
app.setName('spring')
if (process.env.SPRING_DATA_DIR) app.setPath('userData', process.env.SPRING_DATA_DIR)

registerAssetScheme()

let mainWindow: BrowserWindow | null = null
/** Closes the main window without asking the renderer about unsaved changes again. */
let closeWindow = (): void => undefined

function send<E extends keyof ApiEvents>(event: E, payload: ApiEvents[E]): void {
  mainWindow?.webContents.send(event, payload)
}

/** Where the renderer is loaded from: the dev server, or the built files. */
function rendererTarget(): { file: string } | { url: string } {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) return { url: process.env.ELECTRON_RENDERER_URL }
  return { file: join(__dirname, '../renderer/index.html') }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Spring',
    backgroundColor: '#16181d',
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  // The renderer knows the unsaved changes: it asks about them, then calls app.close.
  // A renderer that crashed or is still loading has nothing to ask.
  const window = mainWindow
  let closeConfirmed = false
  window.on('close', (event) => {
    if (closeConfirmed || window.webContents.isCrashed() || window.webContents.isLoading()) return
    event.preventDefault()
    window.webContents.send('app:close-requested', {})
  })
  closeWindow = () => {
    closeConfirmed = true
    window.close()
  }
  // Links open in the browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  const target = rendererTarget()
  if ('url' in target) void mainWindow.loadURL(target.url)
  else void mainWindow.loadFile(target.file)
}

function isTrustedSender(frameUrl: string | undefined): boolean {
  if (!frameUrl) return false
  if (frameUrl.startsWith('file://')) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return !app.isPackaged && !!devUrl && frameUrl.startsWith(devUrl)
}

function registerIpc(api: Api): void {
  for (const domain of Object.keys(API_METHODS) as (keyof Api)[]) {
    for (const method of API_METHODS[domain]) {
      const channel = `${domain}:${String(method)}`
      const schema = (schemas[domain] as Record<string, ZodType>)[method as string]
      const handler = (api[domain] as unknown as Record<string, (arg: unknown) => Promise<unknown>>)[method as string]
      ipcMain.handle(channel, async (event, arg: unknown) => {
        if (!isTrustedSender(event.senderFrame?.url)) throw new Error('Untrusted sender')
        const parsed = schema.safeParse(arg)
        if (!parsed.success) {
          throw new Error(
            `Invalid request for ${channel}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
          )
        }
        return handler(parsed.data)
      })
    }
  }
}

function startApp(): void {
  void app.whenReady().then(ready)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/**
 * `spring mcp`, `spring export …` and the other commands run in the terminal,
 * without window. Unlike the standalone Node CLI, they can print PDFs.
 */
function startCli(args: string[]): void {
  void app
    .whenReady()
    .then(() => {
      const registry = new JsonStore<WorkspaceState>(join(app.getPath('userData'), 'workspaces.json'), () => ({ repos: [], activeRepoId: null }))
      const assets = new AssetRoots((id) => registry.read().repos.find((r) => r.id === id)?.path ?? null)
      assets.serve()
      // Print windows load the renderer, which reaches the job over IPC.
      const exporter = new PdfExporter(assets, rendererTarget)
      ipcMain.handle('print:job', (_event, arg: { token: string }) => exporter.job(arg.token))
      return runCli(args, {
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
        cwd: process.cwd(),
        env: process.env,
        color: !!process.stdout.isTTY && !process.env.NO_COLOR,
        version: app.getVersion(),
        exportPdf: (root, path, file) => {
          const repo = registry.read().repos.find((r) => resolve(r.path) === resolve(root))
          return exporter.export(root, path, file, repo?.name ?? root.split('/').pop() ?? 'Spring')
        }
      })
    })
    .then((code) => app.exit(code))
}

function ready(): void {
  Menu.setApplicationMenu(null)
  const dataDir = app.getPath('userData')
  const watcher = new WorkspaceWatcher((repoId) => send('workspace:files', { repoId }))
  const watchActive = (state: WorkspaceState): void => {
    const active = state.repos.find((r) => r.id === state.activeRepoId)
    watcher.watch(active?.id ?? null, active?.path ?? null)
  }
  const workspace = new WorkspaceManager(join(dataDir, 'workspaces.json'), join(dataDir, 'workspaces'), {
    status: (status) => send('workspace:status', status),
    changed: (state) => {
      watchActive(state)
      send('workspace:changed', state)
    }
  })
  watchActive(workspace.state())

  const assets = new AssetRoots((id) => workspace.state().repos.find((r) => r.id === id)?.path ?? null)
  assets.serve()
  const content = new ContentService(workspace)
  const exporter = new PdfExporter(assets, rendererTarget)
  const updater = new Updater({
    version: app.getVersion(),
    enabled: app.isPackaged && app.getVersion() !== '0.0.0',
    installScript: join(process.resourcesPath, 'install.sh'),
    emit: (status) => send('update:status', status)
  })

  registerIpc(
    createHandlers({
      workspace,
      content,
      exporter,
      updater,
      window: () => mainWindow,
      closeWindow: () => closeWindow()
    })
  )
  createWindow()
  updater.start()

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    // Push pending workspace changes before leaving.
    const timeout = new Promise((resolve) => setTimeout(resolve, 5000))
    void Promise.race([workspace.flush(), timeout]).finally(() => app.quit())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// The packaged binary gets its arguments first; `electron .` in development after the app folder.
const args = process.argv.slice(app.isPackaged ? 1 : 2).filter((arg) => !arg.startsWith('--no-sandbox'))
if (args.length > 0 && COMMANDS.includes(args[0])) startCli(args)
else startApp()
