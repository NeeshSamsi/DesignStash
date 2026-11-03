import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import type { ComponentContract } from './contract'

interface ScaffoldStubProps {
  contract: ComponentContract
  /** Resolved props (defaults applied). */
  props: Record<string, unknown>
  className?: string | undefined
  children?: ReactNode
}

/**
 * Placeholder body for a scaffolded component that hasn't been ported from Figma yet.
 * Renders the component's contract (variant values, text, slots) so screens can already
 * be composed and tests can run. `data-ds-stub` marks it; pnpm ds:scaffold counts it.
 */
export function ScaffoldStub({ contract, props, className, children }: ScaffoldStubProps) {
  const data: Record<string, string> = {}
  for (const axis of Object.keys(contract.axes)) data[`data-${kebab(axis)}`] = String(props[axis])
  for (const flag of Object.keys(contract.flags)) if (props[flag]) data[`data-${kebab(flag)}`] = ''
  if (props.disabled) data['data-disabled'] = ''

  const texts = Object.keys(contract.texts)
    .map((key) => props[key])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
  const slots = Object.keys(contract.slots)
    .map((key) => props[key] as ReactNode)
    .filter((v) => v !== undefined && v !== null && v !== false)

  return (
    <div
      data-ds={contract.name}
      data-ds-stub=""
      {...data}
      aria-disabled={props.disabled ? true : undefined}
      className={cn(
        'flex flex-col gap-1 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground',
        props.disabled === true && 'opacity-50',
        className
      )}
    >
      <span className="font-medium text-foreground">{contract.name}</span>
      {texts.map((text, i) => (
        <span key={i}>{text}</span>
      ))}
      {slots}
      {children}
    </div>
  )
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
