import { useState } from 'react'
import type { IntegrityReport } from '@shared/integrity'
import { SettingsLayout } from '../../components/SettingsLayout'
import type { SettingsLayoutSection } from '../../components/SettingsLayout'
import { DialogFrame } from '../../lib/dialog-shell'
import { DialogDescription, DialogTitle } from '../../ui/dialog'
import { AboutPane } from './AboutPane'
import { AiModelPane } from './AiModelPane'
import { MyStashPane } from './MyStashPane'
import { PrivacyPane } from './PrivacyPane'
import { TagsPane } from './TagsPane'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  /** Open the Trash page. Settings closes first. */
  onOpenTrash?: () => void
  /** Open the stash check's findings. Settings closes first. */
  onReview?: (report: IntegrityReport) => void
}

/**
 * Settings (F1 to F5): an 880×760 modal over whatever page is on show. Esc or ✕ closes it and you are
 * back where you were. Each pane loads its own data when it opens. Rules: design/specs/settings.md.
 */
export function SettingsModal({ open, onClose, onOpenTrash, onReview }: SettingsModalProps) {
  const [section, setSection] = useState<SettingsLayoutSection>('my-stash')

  const pane = {
    'my-stash': (
      <MyStashPane
        onOpenTrash={() => {
          onClose()
          onOpenTrash?.()
        }}
        onReview={(report) => {
          onClose()
          onReview?.(report)
        }}
      />
    ),
    'ai-model': <AiModelPane />,
    tags: <TagsPane />,
    privacy: <PrivacyPane />,
    about: <AboutPane />
  }[section]

  return (
    <DialogFrame
      open={open}
      dataDs="SettingsModal"
      className="w-settings-modal max-w-full gap-0 border-0 bg-transparent p-0 sm:max-w-none"
      onDismiss={onClose}
    >
      <DialogTitle className="sr-only">Settings</DialogTitle>
      <DialogDescription className="sr-only">
        Your stash, AI model, tags, privacy and app info.
      </DialogDescription>
      <SettingsLayout section={section} onSectionChange={setSection} onClose={onClose}>
        {pane}
      </SettingsLayout>
    </DialogFrame>
  )
}
