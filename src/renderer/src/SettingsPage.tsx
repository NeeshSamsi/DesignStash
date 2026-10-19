import { useState, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUiStore } from './stores/uiStore'
import { toast } from './stores/toastStore'
import SettingsAiPane from './SettingsAiPane'
import SettingsPrivacyPane from './SettingsPrivacyPane'
import SettingsTagsPane from './SettingsTagsPane'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

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
        <h3 className="mb-1 text-sm font-semibold text-foreground">Library folder</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          All mockups are stored in this folder. Changing it takes effect on next launch.
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {libraryRoot ?? '—'}
          </code>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => void handleChangeFolder()}
          >
            Change folder…
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Library integrity</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Scan for orphaned files or records that have drifted out of sync.
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={scanStatus === 'scanning'}
          onClick={() => void handleCheckLibrary()}
        >
          {scanStatus === 'scanning' ? 'Scanning…' : 'Check Library'}
        </Button>
        {scanStatus === 'ok' && <p className="mt-2 text-xs text-brand">Library is in sync</p>}
        {scanStatus === 'error' && (
          <p className="mt-2 text-xs text-destructive">Scan failed — check console for details</p>
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
        <span className="text-2xl font-bold tracking-widest text-brand">DS</span>
        <div>
          <p className="text-base font-semibold text-foreground">{appInfo?.name ?? 'DesignStash'}</p>
          <p className="text-xs text-muted-foreground">Version {appInfo?.version ?? '—'}</p>
        </div>
      </div>
      {appInfo?.env && appInfo.env !== 'production' && (
        <Badge variant="secondary" className="w-fit">
          {appInfo.env}
        </Badge>
      )}
      <p className="text-xs text-muted-foreground">A local-first mockup library for designers.</p>
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
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as Tab)}
      className="flex flex-1 flex-col gap-0 overflow-hidden"
    >
      {/* Page header */}
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Settings</h2>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border px-6 pt-3 pb-3">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        <TabsContent value="library">
          <LibrarySection onCheckLibrary={handleCheckLibrary} />
        </TabsContent>
        <TabsContent value="ai">
          <SettingsAiPane />
        </TabsContent>
        <TabsContent value="privacy">
          <SettingsPrivacyPane />
        </TabsContent>
        <TabsContent value="tags">
          <SettingsTagsPane />
        </TabsContent>
        <TabsContent value="about">
          <AboutSection />
        </TabsContent>
      </div>
    </Tabs>
  )
}
