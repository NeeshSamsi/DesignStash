import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { CopyStatus } from '@shared/ipc/import'
import { useCopyStore } from '@renderer/stores/copyStore'
import { AddCardMenu } from './AddCardMenu'

const running = (): CopyStatus => ({
  haulId: 'h1',
  state: 'running',
  total: 4,
  landed: 1,
  bytesTotal: 0,
  bytesCopied: 0,
  bytesPerSecond: 0,
  secondsLeft: null,
  skipped: { notPsd: 0, duplicate: 0, unreadable: 0, archiveUnsupported: 0, noPsdInArchive: 0 },
  files: []
})

const open = () => {
  const card = screen.getByRole('button', { name: /Add mockup/ })
  fireEvent.keyDown(card, { key: 'Enter' })
  return card
}

beforeEach(() => useCopyStore.getState().reset())

describe('AddCardMenu', () => {
  it('tells you that you can drop PSDs anywhere', async () => {
    render(<AddCardMenu onAddFiles={vi.fn()} onAddFolder={vi.fn()} />)
    open()
    expect(await screen.findByText('or drop PSDs anywhere')).toBeTruthy()
  })

  it('says what is added joins the copy while one is running', async () => {
    render(<AddCardMenu onAddFiles={vi.fn()} onAddFolder={vi.fn()} />)
    act(() => useCopyStore.getState().setHaul(running()))
    open()
    expect(await screen.findByText('Copying now. What you add joins the copy.')).toBeTruthy()
    expect(screen.queryByText('or drop PSDs anywhere')).toBeNull()
  })

  it('keeps the focus ring for the keyboard: a mouse press switches it off, a key brings it back', () => {
    render(<AddCardMenu onAddFiles={vi.fn()} onAddFolder={vi.fn()} />)
    const card = screen.getByRole('button', { name: /Add mockup/ })
    expect(card.hasAttribute('data-pointer')).toBe(false)
    fireEvent.pointerDown(card, { button: 0, pointerType: 'mouse' })
    expect(card.hasAttribute('data-pointer')).toBe(true)
    fireEvent.keyDown(card, { key: 'Tab' })
    expect(card.hasAttribute('data-pointer')).toBe(false)
  })
})
