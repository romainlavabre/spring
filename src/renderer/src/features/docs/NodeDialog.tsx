// Creates or edits a section, a page (its title, description and icon) or
// an external link of the menu.
import { useEffect, useState } from 'react'
import type { Link, Section } from '@core/blocks/schema'
import { api, errorMessage } from '../../lib/bridge'
import { Button, Dialog, ErrorBox, Field, Input } from '../../components/ui'
import { IconPicker } from '../../components/IconPicker'

export type NodeDialogRequest =
  | { kind: 'section'; parent: string; path?: undefined }
  | { kind: 'section'; path: string; parent?: undefined }
  | { kind: 'page'; parent: string; path?: undefined }
  | { kind: 'link'; parent: string; path?: undefined }
  | { kind: 'link'; path: string; parent?: undefined }

const TITLES = {
  section: ['New section', 'Section settings'],
  page: ['New page', 'Page settings'],
  link: ['New external link', 'Edit link']
} as const

export function NodeDialog({ request, onClose, onDone }: { request: NodeDialogRequest | null; onClose: () => void; onDone: (path: string) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = !!request?.path

  useEffect(() => {
    setError(null)
    setTitle('')
    setDescription('')
    setIcon('')
    setUrl('')
    if (!request?.path) return
    const load: Promise<Section | Link> =
      request.kind === 'section' ? api.docs.getSection({ path: request.path }) : api.docs.getLink({ path: request.path })
    void load
      .then((node) => {
        setTitle(node.title)
        setDescription(node.description ?? '')
        setIcon(node.icon ?? '')
        if ('url' in node) setUrl((node as Link).url)
      })
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [request])

  if (!request) return null

  const meta = { title: title.trim(), description: description.trim() || undefined, icon: icon.trim() || undefined }
  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const target = request.path
    const parent = request.parent ?? ''
    try {
      let path: string
      if (request.kind === 'section') {
        if (target) {
          const current = await api.docs.getSection({ path: target })
          path = await api.docs.saveSection({ path: target, section: { ...current, ...meta } })
        } else path = await api.docs.createSection({ parent, section: meta })
      } else if (request.kind === 'link') {
        const link = { ...meta, url: url.trim() }
        if (target) {
          const current = await api.docs.getLink({ path: target })
          path = await api.docs.saveLink({ path: target, link: { ...current, ...link } })
        } else path = await api.docs.createLink({ parent, link })
      } else {
        path = await api.docs.createPage({ parent, page: { ...meta, blocks: [{ id: 'intro', type: 'text', md: '' }] } })
      }
      onDone(path)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const valid = !!meta.title && (request.kind !== 'link' || /^(https?|mailto):/i.test(url.trim()))

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={TITLES[request.kind][editing ? 1 : 0]}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={() => void submit()}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !busy) void submit()
        }}
      >
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={request.kind === 'link' ? 'Grafana' : 'Infrastructure'} />
        </Field>
        {request.kind === 'link' && (
          <Field label="URL" hint="Opens in your browser.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://grafana.example.com" />
          </Field>
        )}
        <Field label="Description (optional)" hint={request.kind === 'page' ? 'One line under the title, also shown in search.' : undefined}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Icon (optional)">
          <IconPicker value={icon} onChange={setIcon} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
