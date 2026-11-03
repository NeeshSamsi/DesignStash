// Runtime shape of a component contract. Each `components/<Name>/<Name>.types.ts`
// exports one of these (generated from design/figma/components.json by pnpm ds:scaffold).

export interface ComponentContract {
  /** Code name (PascalCase). */
  readonly name: string
  /** Component-set name in Figma. */
  readonly figmaName: string
  readonly figmaId: string
  readonly figmaUrl: string
  readonly section: string
  readonly description: string
  /** Where the behaviour lives in code today (null = new). */
  readonly code: string | null
  /** Variant axes → union props. */
  readonly axes: Readonly<Record<string, readonly string[]>>
  readonly axisDefaults: Readonly<Record<string, string>>
  /** Two-option Figma `state` axes → boolean props. `on`/`off` are the Figma options. */
  readonly flags: Readonly<Record<string, { readonly on: string; readonly off: string }>>
  /** Figma states that are CSS interactions in code (ds-hover / ds-focus / ds-pressed). */
  readonly interactionStates: readonly string[]
  /** Has a `disabled` boolean prop. */
  readonly disabled: boolean
  readonly booleans: Readonly<Record<string, boolean>>
  readonly texts: Readonly<Record<string, string>>
  /** Icon props → default Hugeicons name (kebab-case). */
  readonly icons: Readonly<Record<string, string>>
  /** ReactNode slot props → the DS component Figma nests there ('content' = free slot). */
  readonly slots: Readonly<Record<string, string>>
}

/** Scaffold status of a component, tracked by pnpm ds:scaffold (stub until the body is ported). */
export type PortStatus = 'stub' | 'ported'
