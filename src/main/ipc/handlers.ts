// Implementation of the IPC API on top of the main-process services.
import { join } from 'node:path'
import { app, clipboard, dialog, shell, type BrowserWindow } from 'electron'
import type { Api } from '@shared/api'
import type { Link, Page, Section } from '@core/blocks/schema'
import { DocStore } from '@core/layout/store'
import { defaultPdfName, downloadsDir, printJobFor, type PdfExporter } from '../export'
import { updateCommand, type Updater } from '../update'
import type { ContentService } from '../workspace/content'
import type { WorkspaceManager } from '../workspace/manager'

export interface Services {
  workspace: WorkspaceManager
  content: ContentService
  exporter: PdfExporter
  updater: Updater
  window(): BrowserWindow | null
  /** Closes the window without asking the renderer again. */
  closeWindow(): void
}

export function createHandlers({ workspace, content, exporter, updater, window, closeWindow }: Services): Api {
  // The interface may open the PDFs it exported, and no other file.
  const exported = new Set<string>()
  const exportedFile = (file: string): string => {
    if (!exported.has(file)) throw new Error('Only the PDFs exported by Spring can be opened from here')
    return file
  }

  return {
    workspace: {
      async state() {
        return workspace.state()
      },
      clone: ({ name, remoteUrl, path }) => workspace.clone(name, remoteUrl, path),
      open: ({ name, path }) => workspace.open(name, path),
      create: ({ name, path }) => workspace.create(name, path),
      async rename({ repoId, name }) {
        return workspace.rename(repoId, name)
      },
      async remove({ repoId, deleteFiles }) {
        return workspace.remove(repoId, deleteFiles)
      },
      activate: ({ repoId }) => workspace.activate(repoId),
      setRemote: ({ repoId, remoteUrl }) => workspace.setRemote(repoId, remoteUrl),
      status: ({ repoId }) => workspace.status(repoId),
      sync: ({ repoId }) => workspace.sync(repoId),
      resolveConflicts: ({ repoId, choices }) => workspace.resolveConflicts(repoId, choices)
    },
    docs: {
      async tree() {
        return content.tree()
      },
      async getPage({ path }) {
        return content.getPage(path)
      },
      async getPageSource({ path }) {
        return content.getPageSource(path)
      },
      createPage: ({ parent, page }) => content.createPage(parent, page as Page),
      savePage: ({ path, page }) => content.savePage(path, page as Page),
      savePageSource: ({ path, source }) => content.savePageSource(path, source),
      duplicatePage: ({ path }) => content.duplicatePage(path),
      async validate({ page }) {
        return content.validate(page)
      },
      async getSection({ path }) {
        return content.getSection(path)
      },
      createSection: ({ parent, section }) => content.createSection(parent, section as Section),
      saveSection: ({ path, section }) => content.saveSection(path, section as Section),
      async getLink({ path }) {
        return content.getLink(path)
      },
      createLink: ({ parent, link }) => content.createLink(parent, link as Link),
      saveLink: ({ path, link }) => content.saveLink(path, link as Link),
      remove: ({ path }) => content.remove(path),
      move: ({ from, parent, before }) => content.move(from, parent, before),
      async search({ query }) {
        return content.search(query)
      },
      async theme() {
        return content.theme()
      }
    },
    assets: {
      async list() {
        return content.listAssets()
      },
      add: ({ name, base64 }) => content.addAsset({ name, data: Buffer.from(base64, 'base64') }),
      async pick() {
        const win = window()
        const options = {
          title: 'Add an image',
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }],
          properties: ['openFile'] as 'openFile'[]
        }
        const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
        const file = result.canceled ? null : result.filePaths[0]
        return file ? content.addAsset({ file }) : null
      }
    },
    exporter: {
      async pdf({ path }) {
        const repo = workspace.active()
        // The title of what is exported names the file.
        const { title } = printJobFor(new DocStore(repo.path), path, '', repo.name)
        const win = window()
        const options = {
          title: 'Export as PDF',
          defaultPath: join(downloadsDir(), defaultPdfName(title)),
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        }
        const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return null
        await exporter.export(repo.path, path, result.filePath, repo.name)
        exported.add(result.filePath)
        return result.filePath
      },
      async open({ file }) {
        const error = await shell.openPath(exportedFile(file))
        if (error) throw new Error(`Cannot open ${file}: ${error}`)
      },
      async reveal({ file }) {
        shell.showItemInFolder(exportedFile(file))
      }
    },
    print: {
      async job({ token }) {
        return exporter.job(token)
      }
    },
    dialog: {
      async openDirectory({ title }) {
        const win = window()
        const options = { title, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
        const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
        return result.canceled ? null : (result.filePaths[0] ?? null)
      }
    },
    app: {
      async info() {
        return { version: app.getVersion(), platform: process.platform }
      },
      async close() {
        closeWindow()
      },
      async openExternal({ url }) {
        await shell.openExternal(url)
      }
    },
    update: {
      status: async () => updater.getStatus(),
      install: () => updater.install(),
      async openTerminal() {
        const command = updateCommand(updater.getStatus().kind)
        if (await updater.openTerminal()) return { command, copied: false }
        clipboard.writeText(command)
        return { command, copied: true }
      },
      async restart() {
        app.relaunch({ execPath: updater.relaunchPath(), args: process.argv.slice(1) })
        app.quit()
      }
    }
  }
}
