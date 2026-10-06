// Exports a page or a section as PDF, after a save dialog.
import { api, errorMessage } from '../../lib/bridge'
import { toast } from '../../components/feedback'

export async function exportPdf(path: string): Promise<void> {
  try {
    const file = await api.exporter.pdf({ path })
    if (file) toast(`PDF saved to ${file}`, 'success')
  } catch (error) {
    toast(errorMessage(error), 'error')
  }
}
