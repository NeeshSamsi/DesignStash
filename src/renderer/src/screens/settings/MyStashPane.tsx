import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { StashCheckStatus, StashInfo, StashMoveProgress } from '@shared/stash'
import type { TrashStats } from '@shared/inbox'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ProgressDialog } from '../../components/ProgressDialog'
import { SettingsGroup, SettingsPathField, SettingsRow } from '../../components/SettingsLayout'
import { subscribePush } from '../../lib/subscribe'
import { toast } from '../../stores/toastStore'
import { Badge } from '../../ui/badge'
import { friendlyPath, shortPath } from '../onboarding/onboarding-copy'
import { formatBytes, mockupCount, stashCheckView, stashFailureCopy } from './settings-copy'

interface Props {
  /** Opens the Trash page and closes Settings. */
  onOpenTrash: () => void
  /** Opens the stash check's findings and closes Settings. */
  onReview: () => void
}

type Moving = { percent: number; label: string } | null
/** A folder picked in Change…, and whether a stash is already in it. */
type Picked = { path: string; holdsStash: boolean } | null

const TONE = {
  none: 'secondary',
  success: 'success',
  warning: 'warning',
  error: 'destructive'
} as const

/** Settings › My Stash: the stash folder, the stash check and the Trash. */
export function MyStashPane({ onOpenTrash, onReview }: Props) {
  const [info, setInfo] = useState<StashInfo | null>(null)
  const [check, setCheck] = useState<StashCheckStatus | null>(null)
  const [trash, setTrash] = useState<TrashStats | null>(null)
  const [checking, setChecking] = useState(false)
  const [picked, setPicked] = useState<Picked>(null)
  const [moving, setMoving] = useState<Moving>(null)
  const [restart, setRestart] = useState(false)
  const [emptying, setEmptying] = useState(false)

  const load = useCallback(async () => {
    const [i, c, t] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.STASH_INFO, undefined),
      window.api.invoke(IPC_CHANNELS.STASH_CHECK_STATUS, undefined),
      window.api.invoke(IPC_CHANNELS.TRASH_STATS, undefined)
    ])
    if (i.success) setInfo(i.data)
    if (c.success) setCheck(c.data)
    if (t.success) setTrash(t.data)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.STASH_MOVE_PROGRESS, (p: StashMoveProgress) => {
        const share = p.totalBytes > 0 ? p.copiedBytes / p.totalBytes : 0
        setMoving({
          percent: Math.round(share * 100),
          label:
            p.phase === 'copying'
              ? `Copying ${formatBytes(p.copiedBytes)} of ${formatBytes(p.totalBytes)}`
              : p.phase === 'verifying'
                ? 'Checking the copy'
                : 'Finishing up'
        })
      }),
    []
  )

  const change = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (!res.success || !res.data.path) return
    const path = res.data.path
    // Use as is only opens a stash that is already there; anywhere else takes a move.
    const check = await window.api.invoke(IPC_CHANNELS.BOOT_CHECK_FOLDER, { path }).catch(() => null)
    setPicked({ path, holdsStash: check?.success === true && check.data.hasLibrary })
  }

  const apply = async (mode: 'move' | 'point') => {
    const path = picked?.path
    if (!path) return
    setPicked(null)
    if (mode === 'move') setMoving({ percent: 0, label: 'Getting ready' })
    const res = await window.api.invoke(IPC_CHANNELS.STASH_CHANGE, { path, mode }).catch(() => null)
    setMoving(null)
    if (res?.success && res.data.ok) {
      setRestart(true)
      setInfo((current) => (current ? { ...current, restartRequired: true } : current))
    } else {
      const copy = stashFailureCopy(res?.success && !res.data.ok ? res.data.reason : 'failed')
      toast({ variant: 'error', message: copy.title, description: copy.description })
    }
  }

  const checkNow = async () => {
    setChecking(true)
    const res = await window.api.invoke(IPC_CHANNELS.STASH_CHECK_RUN, undefined).catch(() => null)
    setChecking(false)
    if (res?.success) setCheck(res.data)
    else
      setCheck({
        lastRun: {
          at: new Date().toISOString(),
          trigger: 'manual',
          result: 'could-not-check',
          toReview: 0
        }
      })
  }

  // The stash check modal loads the findings itself, so Review… only has to open it.
  const review = () => onReview()

  const emptyTrash = async () => {
    setEmptying(false)
    const res = await window.api.invoke(IPC_CHANNELS.TRASH_EMPTY, undefined).catch(() => null)
    if (res?.success) {
      toast(`Trash emptied · ${formatBytes(res.data.bytesFreed)} freed`, 'success')
      void load()
    } else {
      toast({
        variant: 'error',
        message: 'Couldn’t empty Trash',
        description: 'Nothing was deleted. Try again.'
      })
    }
  }

  const what = info
    ? `${mockupCount(info.count)} (${formatBytes(info.bytes)})`
    : 'every PSD and cover'

  const view = check ? stashCheckView(check) : null
  const secondary = (
    label: string,
    onClick: () => void,
    opts: { loading?: boolean; disabled?: boolean; destructive?: boolean } = {}
  ) => (
    <Button
      variant="secondary"
      size="sm"
      label={label}
      loading={opts.loading ?? false}
      disabled={opts.disabled ?? false}
      className={opts.destructive ? 'text-error' : ''}
      onClick={onClick}
    />
  )
  const trashEmpty = trash !== null && trash.count === 0

  return (
    <>
      <SettingsGroup>
        <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
          <div className="flex flex-col gap-1">
            <p className="type-body-sm-medium text-foreground">Stash folder</p>
            <p className="type-body-sm-regular text-muted-foreground">
              Where DesignStash keeps your copied PSDs and covers. Changing it asks whether to move
              everything or just point DesignStash at the new folder.
            </p>
          </div>
          <SettingsPathField
            path={info ? shortPath(friendlyPath(info.path)) : '…'}
            {...(info ? { fullPath: friendlyPath(info.path) } : {})}
            meta={info ? `${mockupCount(info.count)} · ${formatBytes(info.bytes)}` : ''}
            onChange={() => void change()}
          />
          {info?.restartRequired && (
            <p className="type-caption-xs-regular text-tertiary">
              Your new folder takes effect the next time DesignStash starts.
            </p>
          )}
        </div>
        <SettingsRow
          title="Stash check"
          status={view?.tag ? <Badge variant={TONE[view.tone]}>{view.tag}</Badge> : undefined}
          value={view?.line ?? ' '}
          note="Finds PSDs added to or removed from the folder outside DesignStash. Runs every time DesignStash opens."
          controls={
            <>
              {view?.review && secondary('Review…', review)}
              {secondary('Check now', () => void checkNow(), { loading: checking })}
            </>
          }
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          title="Trash"
          value={
            trash
              ? trashEmpty
                ? 'Trash is empty.'
                : `${mockupCount(trash.count)} · ${formatBytes(trash.bytes)}, kept until you empty it.`
              : ' '
          }
          controls={
            <>
              {secondary('Open Trash', onOpenTrash)}
              {secondary('Empty Trash…', () => setEmptying(true), {
                disabled: trash === null || trashEmpty,
                destructive: true
              })}
            </>
          }
        />
      </SettingsGroup>

      {/* A move needs an empty folder, so a folder that holds a stash can only be used as it is. */}
      <ConfirmDialog
        open={picked !== null && !picked.holdsStash}
        variant="neutral"
        detail={false}
        title="Move your stash to this folder?"
        description={`Moving copies ${what} to the new folder.`}
        confirmLabel="Move my files"
        cancelLabel="Cancel"
        onCancel={() => setPicked(null)}
        onConfirm={() => void apply('move')}
      />
      <ConfirmDialog
        open={picked?.holdsStash === true}
        variant="neutral"
        detail={false}
        title="Use the stash in this folder?"
        description="This folder already holds a stash. DesignStash opens it the next time it starts, and your current stash stays where it is."
        confirmLabel="Use as is"
        cancelLabel="Cancel"
        onCancel={() => setPicked(null)}
        onConfirm={() => void apply('point')}
      />
      <ProgressDialog
        open={moving !== null}
        state="running"
        title="Moving your stash"
        description="Keep DesignStash open until this finishes."
        percent={moving?.percent ?? 0}
        progressLabel={moving?.label ?? ''}
      />
      <ConfirmDialog
        open={restart}
        variant="neutral"
        detail={false}
        title="Restart to use the new folder"
        description="DesignStash needs to restart before it uses your new stash folder."
        confirmLabel="Restart now"
        cancelLabel="Later"
        onCancel={() => setRestart(false)}
        onConfirm={() => {
          setRestart(false)
          void window.api.invoke(IPC_CHANNELS.APP_RELAUNCH, undefined)
        }}
      />
      <ConfirmDialog
        open={emptying}
        variant="destructive"
        detail={false}
        title="Empty Trash?"
        description={
          trash
            ? `This permanently deletes ${mockupCount(trash.count)} and frees ${formatBytes(trash.bytes)}. It can’t be undone.`
            : 'This permanently deletes everything in Trash. It can’t be undone.'
        }
        confirmLabel="Empty Trash"
        cancelLabel="Cancel"
        onCancel={() => setEmptying(false)}
        onConfirm={() => void emptyTrash()}
      />
    </>
  )
}
