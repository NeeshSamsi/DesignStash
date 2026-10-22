import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { Button } from '../../components/Button'
import { Textarea } from '../../components/Textarea'
import { DialogFrame, DialogHeading } from '../../lib/dialog-shell'
import { toast } from '../../stores/toastStore'

const MESSAGE_MAX = 4000

interface ReportDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Report a problem: what happened, the exact text that goes with it (shown in full, expandable)
 * and Send. Send works with usage data off: the person sees what goes before pressing it. If it
 * cannot be sent, the report is kept for the next launch or offered as Copy.
 */
export function ReportDialog({ open, onClose }: ReportDialogProps) {
  const [sending, setSending] = useState(false)
  const close = () => {
    if (!sending) onClose()
  }
  return (
    <DialogFrame
      open={open}
      dataDs="ReportDialog"
      className="w-160 max-w-full"
      onDismiss={close}
      showCloseButton
    >
      {/* The form mounts with the dialog, so every opening starts clean. */}
      <ReportForm sending={sending} setSending={setSending} onClose={onClose} />
    </DialogFrame>
  )
}

interface ReportFormProps {
  sending: boolean
  setSending: (sending: boolean) => void
  onClose: () => void
}

function ReportForm({ sending, setSending, onClose }: ReportFormProps) {
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [unsent, setUnsent] = useState(false)

  useEffect(() => {
    void window.api.invoke(IPC_CHANNELS.REPORT_COPY, { action: 'preview' }).then((res) => {
      setDetails(res.success ? (res.data.text ?? '') : '')
    })
  }, [])

  const close = () => {
    if (!sending) onClose()
  }

  const send = async () => {
    setSending(true)
    const res = await window.api
      .invoke(IPC_CHANNELS.REPORT_COPY, { action: 'send', message })
      .catch(() => null)
    setSending(false)
    const outcome = res?.success ? res.data.outcome : 'unavailable'
    if (outcome === 'sent') {
      toast({
        variant: 'success',
        message: 'Thanks, your report was sent',
        description: 'It was anonymous, and only the text you saw went.'
      })
      onClose()
    } else if (outcome === 'queued') {
      toast({
        variant: 'success',
        message: 'Saved for later',
        description: 'You’re offline. It will send next time DesignStash opens.'
      })
      onClose()
    } else {
      setUnsent(true)
    }
  }

  const copy = async () => {
    const res = await window.api
      .invoke(IPC_CHANNELS.REPORT_COPY, { action: 'copy-full', message })
      .catch(() => null)
    if (res?.success && res.data.copied) {
      toast({
        variant: 'success',
        message: 'Copied your problem report',
        description: 'Paste it into your message. No files are included.'
      })
      onClose()
    } else {
      toast({
        variant: 'error',
        message: 'Couldn’t copy the report',
        description: 'Try again in a moment.'
      })
    }
  }

  return (
    <>
      <DialogHeading
        title="Report a problem"
        description="Tell us what happened. Only what you see below is sent, and it’s anonymous."
      />
      <Textarea
        aria-label="What happened"
        placeholder="What happened?"
        rowRange="4-6"
        maxLength={MESSAGE_MAX}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="type-body-sm-medium text-foreground">Also sent with it</p>
          <Button
            variant="secondary"
            size="sm"
            label={expanded ? 'Hide' : 'Show all'}
            onClick={() => setExpanded((v) => !v)}
          />
        </div>
        <p className="type-caption-xs-regular text-tertiary">
          Your app version, system, library counts and the last 200 log lines. No file names, titles,
          tags or images.
        </p>
        {expanded && (
          <pre
            data-testid="report-details"
            className="max-h-modal-body overflow-y-auto rounded-lg bg-surface-1 p-3 type-caption-xs-regular whitespace-pre-wrap text-muted-foreground"
          >
            {details ?? 'Loading…'}
          </pre>
        )}
      </div>
      {unsent && (
        <p role="status" className="type-body-sm-regular text-muted-foreground">
          Couldn’t send it. Copy the report and paste it into a message instead.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {unsent && <Button variant="secondary" label="Copy report" onClick={() => void copy()} />}
        <Button variant="secondary" label="Cancel" disabled={sending} onClick={close} />
        <Button
          variant="primary"
          label="Send"
          loading={sending}
          disabled={sending || details === null}
          onClick={() => void send()}
        />
      </div>
    </>
  )
}
