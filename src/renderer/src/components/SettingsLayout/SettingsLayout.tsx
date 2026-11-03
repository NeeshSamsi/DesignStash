import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  AiMagicIcon,
  Cancel01Icon,
  Folder01Icon,
  FolderLibraryIcon,
  InformationCircleIcon,
  Shield01Icon,
  Tag01Icon
} from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'
import { ConsentPanel } from '@renderer/components/ConsentPanel'
import { HardwareSummary } from '@renderer/components/HardwareSummary'
import { ModelCard } from '@renderer/components/ModelCard'
import { SidebarNavItem } from '@renderer/components/SidebarNavItem'
import { Switch } from '@renderer/components/Switch'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import {
  SETTINGS_LAYOUT_DEFAULTS,
  type SettingsLayoutContractProps,
  type SettingsLayoutSection
} from './SettingsLayout.types'
import {
  SETTINGS_BODY,
  SETTINGS_GROUP,
  SETTINGS_PANE,
  SETTINGS_RAIL,
  SETTINGS_ROW,
  settingsLayoutVariants
} from './SettingsLayout.variants'

export interface SettingsLayoutProps
  extends
    SettingsLayoutContractProps,
    Omit<ComponentProps<'div'>, keyof SettingsLayoutContractProps | 'children'> {
  /** The pane's rows. Replaces Figma's sample for the section. */
  children?: ReactNode
  onSectionChange?: (section: SettingsLayoutSection) => void
  /** The ✕ (and Esc, which the live dialog around this wires). */
  onClose?: () => void
}

const SECTIONS: { key: SettingsLayoutSection; label: string; icon: IconSvgElement }[] = [
  { key: 'my-stash', label: 'My Stash', icon: FolderLibraryIcon },
  { key: 'ai-model', label: 'AI model', icon: AiMagicIcon },
  { key: 'tags', label: 'Tags', icon: Tag01Icon },
  { key: 'privacy', label: 'Privacy', icon: Shield01Icon },
  { key: 'about', label: 'About', icon: InformationCircleIcon }
]

/** A grouped container of rows, as every pane uses. Rows are separated by a hairline. */
export function SettingsGroup({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-ds="SettingsGroup"
      className={cn(SETTINGS_GROUP, '[&>*+*]:border-t [&>*+*]:border-subtle', className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface SettingsRowProps {
  title: string
  /** Status tag beside the title: "In sync", "Up to date". */
  status?: ReactNode
  /** The line that shows the real value: a path, a size, when something was last checked. */
  value?: ReactNode
  /** A quieter line under the value. */
  note?: ReactNode
  /** The control on the right. Every inline button is the secondary button. */
  controls?: ReactNode
}

/** One grouped row: a title, a line with the real value, the control on the right. */
export function SettingsRow({ title, status, value, note, controls }: SettingsRowProps) {
  return (
    <div data-ds="SettingsRow" className={SETTINGS_ROW}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="type-body-sm-medium text-foreground">{title}</p>
          {status}
        </div>
        {value && <p className="type-body-sm-regular text-muted-foreground">{value}</p>}
        {note && <p className="type-caption-xs-regular text-tertiary">{note}</p>}
      </div>
      {controls && <div className="flex shrink-0 items-center gap-2">{controls}</div>}
    </div>
  )
}

interface SettingsPathFieldProps {
  path?: string
  /** The whole path, shown as a tooltip when `path` is cut short. */
  fullPath?: string
  /** "128 mockups · 14.2 GB". */
  meta?: string
  onChange?: () => void
}

/** The Stash folder's path field: folder icon, path, size, and Change… attached on the right. */
export function SettingsPathField({
  path = '~/Pictures/DesignStash',
  fullPath,
  meta = '128 mockups · 14.2 GB',
  onChange
}: SettingsPathFieldProps) {
  const pathText = (
    <span className="min-w-0 flex-1 truncate type-body-sm-regular text-foreground">{path}</span>
  )
  return (
    <div className="flex items-stretch overflow-clip rounded-lg border border-input bg-surface-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <HugeiconsIcon icon={Folder01Icon} strokeWidth={ICON_STROKE} className="size-4 shrink-0" />
        {fullPath && fullPath !== path ? (
          <Tooltip>
            <TooltipTrigger asChild>{pathText}</TooltipTrigger>
            <TooltipContent side="top" align="start">
              {fullPath}
            </TooltipContent>
          </Tooltip>
        ) : (
          pathText
        )}
        <span className="shrink-0 type-caption-xs-regular text-tertiary">{meta}</span>
      </div>
      <div className="w-px bg-input" aria-hidden />
      <Button variant="secondary" label="Change…" className="rounded-none" onClick={onChange} />
    </div>
  )
}

const secondary = (label: string) => <Button variant="secondary" size="sm" label={label} />

/** Figma's sample content for each section, so the catalog shows the real pane shapes. */
function Sample({ section, slots }: { section: SettingsLayoutSection; slots: SlotProps }) {
  switch (section) {
    case 'my-stash':
      return (
        <>
          <SettingsGroup>
            <div className="flex flex-col gap-3 px-4 pt-3.5 pb-4">
              <div className="flex flex-col gap-1">
                <p className="type-body-sm-medium text-foreground">Stash folder</p>
                <p className="type-body-sm-regular text-muted-foreground">
                  Where DesignStash keeps your copied PSDs and covers. Changing it asks whether to
                  move everything or just point DesignStash at the new folder.
                </p>
              </div>
              <SettingsPathField />
            </div>
            <SettingsRow
              title="Stash check"
              status={<Badge variant="success">In sync</Badge>}
              value="Checked when DesignStash opened, today 9:41"
              note="Finds PSDs added to or removed from the folder outside DesignStash. Runs every time DesignStash opens."
              controls={secondary('Check now')}
            />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsRow
              title="Trash"
              value="3 mockups · 412 MB, kept until you empty it."
              controls={
                <>
                  {secondary('Open Trash')}
                  {secondary('Empty Trash…')}
                </>
              }
            />
          </SettingsGroup>
        </>
      )
    case 'ai-model':
      return (
        <>
          <HardwareSummary />
          <SettingsGroup>
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="type-body-sm-medium text-foreground">Use on-device AI</p>
                <p className="type-body-sm-regular text-muted-foreground">
                  Suggests titles and tags by looking at each cover. Nothing leaves your Mac.
                </p>
              </div>
              <Switch
                showLabel={false}
                aria-label="Use on-device AI"
                checked
                onCheckedChange={() => {}}
              />
            </div>
            <div className="flex flex-col gap-2 px-4 pt-3.5 pb-4">
              <p className="type-label-xs-medium text-tertiary">Your models</p>
              {slots.modelQwen25VL3B ?? <ModelCard state="in-use" bestFit />}
              <p className="mt-2 type-label-xs-medium text-tertiary">Available to download</p>
              {slots.modelQwen25VL7B ?? (
                <ModelCard
                  state="available"
                  name="Qwen 2.5 VL 7B"
                  size="5.5 GB"
                  quality={5}
                  speed={2}
                  description="The best titles and tags. Needs 16 GB of memory or more."
                />
              )}
            </div>
          </SettingsGroup>
        </>
      )
    case 'tags':
      return (
        slots.tagTree ?? <p className="type-body-sm-regular text-tertiary">Your tags show here.</p>
      )
    case 'privacy':
      return <ConsentPanel mode="accordion" enabled />
    case 'about':
      return (
        <>
          <SettingsGroup>
            <SettingsRow title="DesignStash" value="Version 1.0.0 (42)" />
            <SettingsRow
              title="Updates"
              status={<Badge variant="success">Up to date</Badge>}
              value="Checked just now"
              controls={secondary('Check for updates')}
            />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsRow
              title="Open-source licences"
              value="The libraries DesignStash is built on."
              controls={secondary('View')}
            />
            <SettingsRow
              title="Report a problem"
              value="Opens a short form with your app version filled in. No files are sent."
              controls={secondary('Copy report')}
            />
          </SettingsGroup>
        </>
      )
  }
}

type SlotProps = Pick<
  SettingsLayoutContractProps,
  'modelQwen25VL3B' | 'modelQwen25VL7B' | 'tagTree'
>

/**
 * SettingsLayout — Settings as a modal over the app (880×760): section list on the left (same selected
 * style as the sidebar), pane title + close, grouped rows. Panes scroll inside it.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4771
 * Used by SettingsModal. Pass the pane's rows as `children` (built from SettingsGroup and SettingsRow);
 * without them it shows Figma's sample for the section. Every inline button is secondary; only the
 * close ✕ is a ghost icon button.
 */
export function SettingsLayout({
  className,
  children,
  onSectionChange,
  onClose,
  ...rest
}: SettingsLayoutProps) {
  const { section, modelQwen25VL3B, modelQwen25VL7B, tagTree, ...props } = {
    ...SETTINGS_LAYOUT_DEFAULTS,
    ...rest
  }
  const current = SECTIONS.find((item) => item.key === section)!
  return (
    <div
      data-ds="SettingsLayout"
      data-section={section}
      className={cn(settingsLayoutVariants({ section }), className)}
      {...props}
    >
      <nav aria-label="Settings sections" className={SETTINGS_RAIL}>
        <p className="pb-2.5 pl-2 type-body-sm-medium text-tertiary">Settings</p>
        {SECTIONS.map((item) => (
          <SidebarNavItem
            key={item.key}
            label={item.label}
            icon={item.icon}
            showCount={false}
            active={item.key === section}
            onClick={() => onSectionChange?.(item.key)}
          />
        ))}
      </nav>
      <div className={SETTINGS_PANE}>
        <div className="flex items-center">
          <h2 className="min-w-0 flex-1 type-title-lg-semibold text-foreground">{current.label}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            showIconStart
            iconStart={Cancel01Icon}
            onClick={onClose}
          />
        </div>
        <div className={SETTINGS_BODY}>
          {children ?? (
            <Sample section={section} slots={{ modelQwen25VL3B, modelQwen25VL7B, tagTree }} />
          )}
        </div>
      </div>
    </div>
  )
}
