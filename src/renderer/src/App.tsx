// Application shell: the menu of the workspace and the page shown.
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { FolderGit2 } from 'lucide-react'
import { useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { DialogHost, Toaster } from './components/feedback'
import { Button, EmptyState } from './components/ui'
import { MainArea } from './features/layout/MainArea'
import { Sidebar } from './features/layout/Sidebar'
import { UnsavedChanges } from './features/layout/UnsavedChanges'
import { SearchDialog } from './features/search/SearchDialog'
import { UpdateBadge, UpdateNotice } from './features/update/UpdateNotice'
import { AddWorkspaceDialog } from './features/workspace/AddWorkspaceDialog'
import { WorkspaceSwitcher } from './features/workspace/WorkspaceSwitcher'
import { useActiveRepo, useWorkspaceStatus } from './features/workspace/useWorkspace'

export function App() {
  useWorkspaceStatus()
  const repo = useActiveRepo()

  return (
    <RadixTooltip.Provider>
      <Group orientation="horizontal" className="h-full">
        <Panel defaultSize="20" minSize={230} maxSize="40">
          {repo ? (
            <Sidebar />
          ) : (
            <aside className="flex h-full flex-col bg-panel">
              <WorkspaceSwitcher />
              <div className="flex-1" />
              <UpdateBadge />
            </aside>
          )}
        </Panel>
        <Separator className="resize-handle w-px" />
        <Panel minSize="40">
          <main className="h-full min-w-0">{repo ? <MainArea key={repo.id} /> : <Welcome />}</main>
        </Panel>
      </Group>
      <UpdateNotice />
      <UnsavedChanges />
      <SearchDialog />
      <Toaster />
      <DialogHost />
    </RadixTooltip.Provider>
  )
}

function Welcome() {
  const [adding, setAdding] = useState(false)
  return (
    <EmptyState icon={<FolderGit2 className="size-10" />} title="Welcome to Spring">
      <p className="max-w-md text-xs leading-relaxed">
        Create a workspace to start, or clone the git repository your team shares. Each workspace is its own git repository of documentation.
      </p>
      <Button variant="primary" onClick={() => setAdding(true)}>
        Add workspace
      </Button>
      <AddWorkspaceDialog open={adding} onOpenChange={setAdding} />
    </EmptyState>
  )
}
