import { useState, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUiStore } from './stores/uiStore'
import { toast } from './stores/toastStore'
import SettingsAiPane from './SettingsAiPane'
import SettingsPrivacyPane from './SettingsPrivacyPane'
import SettingsTagsPane from './SettingsTagsPane'

type Tab = 'library' | 'ai' | 'privacy' | 'tags' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'ai', label: 'AI Models' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'tags', label: 'Tags' },
  { id: 'about', label: 'About' },
]

// --- Library section ---

function LibrarySection({ onCheckLibrary }: { onCheckLibrary: () => Promise<void> }) {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'ok' | 'error'>('idle')

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SETTINGS_GET, undefined)
      if (res.success) setLibraryRoot(res.data.libraryRoot)
    })()
  }, [])

  const handleChangeFolder = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (res.success && res.data.path) {
      const saveRes = await window.api.invoke(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, {
        path: res.data.path,
      })
      if (saveRes.success) {
        setLibraryRoot(res.data.path)
        toast('Library folder updated — takes effect on next launch.', 'success')
      }
    }
  }

  const handleCheckLibrary = async () => {
    setScanStatus('scanning')
    await onCheckLibrary()
    setScanStatus('idle')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Library folder</h3>
        <p className="text-xs text-neutral-400 mb-3">
          All mockups are stored in this folder. Changing it takes effect on next launch.
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 text-xs bg-neutral-700 text-neutral-300 px-3 py-2 rounded-lg truncate">
            {libraryRoot ?? '—'}
          </code>
          <button
            onClick={() => void handleChangeFolder()}
            className="text-xs bg-neutral-700 hover:bg-neutral-600 text-slate-200 px-3 py-2 rounded-lg transition-colors shrink-0"
          >
            Change folder…
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Library integrity</h3>
        <p className="text-xs text-neutral-400 mb-3">
          Scan for orphaned files or records that have drifted out of sync.
        </p>
        <button
          disabled={scanStatus === 'scanning'}
          onClick={() => void handleCheckLibrary()}
          className="text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-slate-200 px-4 py-2 rounded-lg transition-colors"
        >
          {scanStatus === 'scanning' ? 'Scanning…' : 'Check Library'}
        </button>
        {scanStatus === 'ok' && (
          <p className="mt-2 text-xs text-green-400">Library is in sync</p>
        )}
        {scanStatus === 'error' && (
          <p className="mt-2 text-xs text-red-400">Scan failed — check console for details</p>
        )}
      </div>
    </div>
  )
}

// --- About section ---

function AboutSection() {
  const [appInfo, setAppInfo] = useState<{
    name: string
    version: string
    env: string
  } | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.APP_INFO, undefined)
      if (res.success) setAppInfo(res.data)
    })()
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold text-brand-500 tracking-widest">DS</span>
        <div>
          <p className="text-base font-semibold text-slate-100">{appInfo?.name ?? 'DesignStash'}</p>
          <p className="text-xs text-neutral-400">Version {appInfo?.version ?? '—'}</p>
        </div>
      </div>
      {appInfo?.env && appInfo.env !== 'production' && (
        <span className="text-xs bg-amber-700/40 text-amber-300 px-2 py-1 rounded w-fit">
          {appInfo.env}
        </span>
      )}
      <p className="text-xs text-neutral-500">A local-first mockup library for designers.</p>
    </div>
  )
}

// --- SettingsPage ---

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('library')
  const openModal = useUiStore((s) => s.openModal)

  const handleCheckLibrary = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_SCAN, undefined)
    if (!res.success) return
    const report = res.data
    const hasIssues = report.orphanFiles.length > 0 || report.orphanRecords.length > 0
    if (!hasIssues) {
      toast('Library is in sync — no issues found.', 'success')
    } else {
      openModal({ kind: 'reconcile', report })
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-neutral-800">
        <h2 className="text-base font-semibold text-slate-100">Settings</h2>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-3 border-b border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
              activeTab === tab.id
                ? 'text-brand-500 border-brand-500'
                : 'text-neutral-400 border-transparent hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'library' && (
          <LibrarySection onCheckLibrary={handleCheckLibrary} />
        )}
        {activeTab === 'ai' && <SettingsAiPane />}
        {activeTab === 'privacy' && <SettingsPrivacyPane />}
        {activeTab === 'tags' && <SettingsTagsPane />}
        {activeTab === 'about' && <AboutSection />}
      </div>
    </div>
  )
}
