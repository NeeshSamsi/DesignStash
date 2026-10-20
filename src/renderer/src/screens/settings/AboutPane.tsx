import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { Button } from '../../components/Button'
import { SettingsGroup, SettingsRow } from '../../components/SettingsLayout'
import { DialogFrame, DialogHeading } from '../../lib/dialog-shell'
import { toast } from '../../stores/toastStore'
import { Badge } from '../../ui/badge'
import { formatWhen } from './settings-copy'

type Update =
  | { state: 'up-to-date'; lastCheckedAt: string | null }
  | { state: 'available'; version: string; lastCheckedAt: string | null }
  | { state: 'downloading'; version: string; progress: number; lastCheckedAt: string | null }
  | { state: 'ready'; version: string; lastCheckedAt: string | null }

/** Settings › About: version, updates, licences and the problem report. */
export function AboutPane() {
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<Update | null>(null)
  const [checking, setChecking] = useState(false)
  const [licences, setLicences] = useState<string | null>(null)

  const status = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.UPDATES_STATUS, undefined)
    if (res.success) setUpdate(res.data)
  }, [])

  useEffect(() => {
    void window.api.invoke(IPC_CHANNELS.APP_INFO, undefined).then((res) => {
      if (res.success) setVersion(res.data.version)
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void status()
  }, [status])

  // A download has no push event, so look again once a second while one runs.
  const downloading = update?.state === 'downloading'
  useEffect(() => {
    if (!downloading) return
    const timer = window.setInterval(() => void status(), 1000)
    return () => window.clearInterval(timer)
  }, [downloading, status])

  const check = async () => {
    setChecking(true)
    const res = await window.api.invoke(IPC_CHANNELS.UPDATES_CHECK, undefined).catch(() => null)
    setChecking(false)
    if (res?.success) setUpdate(res.data)
    else
      toast({
        variant: 'error',
        message: 'Couldn’t check for updates',
        description: 'Try again in a moment.'
      })
  }

  const cancel = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.UPDATES_CANCEL, undefined)
    if (res.success) setUpdate(res.data)
  }

  const viewLicences = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.LICENCES_TEXT, undefined)
    if (res.success) setLicences(res.data.text)
    else
      toast({
        variant: 'error',
        message: 'Couldn’t load the licences',
        description: 'Try again in a moment.'
      })
  }

  const report = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.REPORT_COPY, undefined)
    if (res.success && res.data.copied) {
      toast({
        variant: 'success',
        message: 'Copied your problem report',
        description: 'Paste it into your message. No files are included.'
      })
    } else {
      toast({
        variant: 'error',
        message: 'Couldn’t copy the report',
        description: 'Try again in a moment.'
      })
    }
  }

  const secondary = (label: string, onClick: () => void, loading = false) => (
    <Button variant="secondary" size="sm" label={label} loading={loading} onClick={onClick} />
  )

  let tag: React.ReactNode
  let line = ' '
  let control: React.ReactNode = secondary('Check for updates', () => void check(), checking)
  if (update?.state === 'up-to-date') {
    tag = <Badge variant="success">Up to date</Badge>
    line = update.lastCheckedAt ? `Checked ${formatWhen(update.lastCheckedAt)}` : 'Not checked yet'
  } else if (update?.state === 'available') {
    tag = <Badge variant="info">{update.version}</Badge>
    line = 'Starting the download…'
    control = secondary('Cancel', () => void cancel())
  } else if (update?.state === 'downloading') {
    tag = <Badge variant="info">{update.version}</Badge>
    line = `Downloading ${Math.round(update.progress * 100)}%`
    control = secondary('Cancel', () => void cancel())
  } else if (update?.state === 'ready') {
    tag = <Badge variant="success">{update.version}</Badge>
    line = 'Ready to install. DesignStash restarts to finish.'
    control = secondary(
      'Restart now',
      () => void window.api.invoke(IPC_CHANNELS.UPDATES_INSTALL, undefined)
    )
  }

  return (
    <>
      <SettingsGroup>
        <SettingsRow title="DesignStash" value={version ? `Version ${version}` : ' '} />
        <SettingsRow title="Updates" status={tag} value={line} controls={control} />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          title="Open-source licences"
          value="The libraries DesignStash is built on."
          controls={secondary('View', () => void viewLicences())}
        />
        <SettingsRow
          title="Report a problem"
          value="Copies a short report with your app version. No files are included."
          controls={secondary('Report…', () => void report())}
        />
      </SettingsGroup>
      <DialogFrame
        open={licences !== null}
        dataDs="LicencesDialog"
        className="w-160 max-w-full"
        onDismiss={() => setLicences(null)}
        showCloseButton
      >
        <DialogHeading
          title="Open-source licences"
          description="The libraries DesignStash is built on."
        />
        <pre className="max-h-modal-body overflow-y-auto rounded-lg bg-surface-1 p-3 type-caption-xs-regular whitespace-pre-wrap text-secondary">
          {licences}
        </pre>
      </DialogFrame>
    </>
  )
}
