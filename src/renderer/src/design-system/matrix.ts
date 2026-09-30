import type { ComponentContract } from './contract'

type Props = Record<string, string | boolean>

/** Every combination of the contract's variant axes (the rows of a Figma variant table). */
export function axisCombinations(contract: ComponentContract): Props[] {
  let rows: Props[] = [{}]
  for (const [axis, options] of Object.entries(contract.axes)) {
    rows = rows.flatMap((row) => options.map((option) => ({ ...row, [axis]: option })))
  }
  return rows
}

export interface PreviewColumn {
  /** Column label: the Figma state name. */
  label: string
  /** Props that put the component in this state. */
  props: Props
}

/**
 * The state columns of a Figma variant table that are props: rest, each flag, disabled.
 * Interaction states (hover / focus / pressed) are plain CSS — hover the catalog to see them.
 */
export function stateColumns(contract: ComponentContract): PreviewColumn[] {
  const columns: PreviewColumn[] = [{ label: 'rest', props: {} }]
  for (const [flag, { on }] of Object.entries(contract.flags))
    columns.push({ label: on, props: { [flag]: true } })
  if (contract.disabled) columns.push({ label: 'disabled', props: { disabled: true } })
  return columns
}

const describe = (props: Props) =>
  Object.entries(props)
    .map(([k, v]) => (v === true ? k : `${k}=${String(v)}`))
    .join(' ') || 'defaults'

/** Flat [label, props] list of every row × state column — used by the generated tests. */
export function variantMatrix(contract: ComponentContract): [string, Props][] {
  const columns = stateColumns(contract)
  return axisCombinations(contract).flatMap((row) =>
    columns.map((col): [string, Props] => {
      const props = { ...row, ...col.props }
      return [describe(props), props]
    })
  )
}
