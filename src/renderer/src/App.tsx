// PLACEHOLDER UI — replace in design pass
import { useState, useEffect, useCallback } from 'react'
import type { ImportProgress, ImportSummary } from '@shared/ipc'
import { IPC_CHANNELS } from '@shared/ipc'

export default function App() {
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [isDropping, setIsDropping] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.onImportProgress(setImportProgress)
    return () => unsubscribe()
  }, [])

  const handleImport = useCallback(async (paths: string[]) => {
    setImportSummary(null)
    setImportProgress(null)
    const result = await window.api.invoke(IPC_CHANNELS.IMPORT_START, { paths })
    if (result.success) {
      setImportSummary(result.data)
    } else {
      console.error(result.error)
    }
  }, [])

  const handleFileSelect = async () => {
    const result = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, undefined)
    if (result.success && result.data.paths.length > 0) {
      handleImport(result.data.paths)
    }
  }

  const handleFolderSelect = async () => {
    const result = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (result.success && result.data.path) {
      handleImport([result.data.path])
    }
  }

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDropping(false)
      const files = Array.from(event.dataTransfer.files)
      if (files.length > 0) {
        const paths = files.map((file) => window.api.getPathForFile(file))
        handleImport(paths)
      }
    },
    [handleImport]
  )

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropping(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropping(false)
  }

  return (
    <main
      className={`min-h-screen bg-neutral-900 text-slate-100 flex flex-col items-center justify-center p-8 font-sans ${
        isDropping ? 'bg-blue-900' : ''
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-2xl p-8 border border-neutral-700">
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">DesignStash</h1>
        <div className="flex space-x-2 my-4">
          <button
            onClick={handleFileSelect}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            Add Files
          </button>
          <button
            onClick={handleFolderSelect}
            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            Add Folder
          </button>
        </div>
        {importProgress && importProgress.phase !== 'done' && (
          <div>
            <p>
              {importProgress.phase}: {importProgress.completed} / {importProgress.total}
            </p>
            <p>{importProgress.currentTitle}</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${(importProgress.completed / importProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
        {importSummary && (
          <div>
            <p>Import Complete!</p>
            <p>Imported: {importSummary.imported}</p>
            <p>Pending Preview: {importSummary.pendingPreview}</p>
            <p>Duplicates: {importSummary.duplicates}</p>
            <p>Errors: {importSummary.errors}</p>
            <p>Skipped (non-PSD): {importSummary.skippedNonPsd}</p>
          </div>
        )}
      </div>
    </main>
  )
}
