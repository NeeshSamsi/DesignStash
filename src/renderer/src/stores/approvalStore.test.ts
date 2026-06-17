import { describe, it, expect, beforeEach } from 'vitest'
import { useApprovalStore } from './approvalStore'
import type { ApprovalItem, ApprovalQueue } from '@shared/approval'

const makeItem = (mockupId: number, title: string): ApprovalItem => ({
  mockupId,
  leaderId: null,
  isLeader: false,
  variantIndex: 0,
  title,
  description: '',
  tags: [],
  coverPath: `/covers/${mockupId}.png`,
  coverSource: 'embedded',
  sidecarFileName: null
})

const makeQueue = (items: ApprovalItem[]): ApprovalQueue => ({
  batchId: 'test-batch',
  items
})

beforeEach(() => {
  useApprovalStore.getState().reset()
})

describe('useApprovalStore — applyReinferred', () => {
  it('skips items in manuallyEditedIds when applying re-inferred results', () => {
    const item1 = makeItem(1, 'Original 1')
    const item2 = makeItem(2, 'Original 2')
    const item3 = makeItem(3, 'Original 3')

    useApprovalStore.getState().setQueue(makeQueue([item1, item2, item3]))

    // Mark item 2 as manually edited
    useApprovalStore.setState((s) => ({
      manuallyEditedIds: new Set([2]),
      currentIndex: s.currentIndex
    }))

    // Apply re-inferred updates to items 2 and 3
    useApprovalStore.getState().applyReinferred([
      { ...item2, title: 'Reinferred 2' },
      { ...item3, title: 'Reinferred 3' }
    ])

    const queue = useApprovalStore.getState().queue
    expect(queue[0]!.title).toBe('Original 1')
    expect(queue[1]!.title).toBe('Original 2')   // NOT overwritten — was manually edited
    expect(queue[2]!.title).toBe('Reinferred 3')  // Updated — not in manuallyEditedIds
  })
})

describe('useApprovalStore — navigation', () => {
  it('goNext advances index; goBack decrements it', () => {
    useApprovalStore.getState().setQueue(makeQueue([makeItem(1, 'A'), makeItem(2, 'B'), makeItem(3, 'C')]))

    expect(useApprovalStore.getState().currentIndex).toBe(0)
    useApprovalStore.getState().goNext()
    expect(useApprovalStore.getState().currentIndex).toBe(1)
    useApprovalStore.getState().goBack()
    expect(useApprovalStore.getState().currentIndex).toBe(0)
  })

  it('goBack does not go below 0', () => {
    useApprovalStore.getState().setQueue(makeQueue([makeItem(1, 'A')]))
    useApprovalStore.getState().goBack()
    expect(useApprovalStore.getState().currentIndex).toBe(0)
  })

  it('goNext does not exceed queue length - 1', () => {
    useApprovalStore.getState().setQueue(makeQueue([makeItem(1, 'A')]))
    useApprovalStore.getState().goNext()
    expect(useApprovalStore.getState().currentIndex).toBe(0)
  })
})

describe('useApprovalStore — updateCurrentItem', () => {
  it('merges updates into the current item', () => {
    useApprovalStore.getState().setQueue(makeQueue([makeItem(1, 'Old Title')]))
    useApprovalStore.getState().updateCurrentItem({ title: 'New Title', description: 'A description' })
    const item = useApprovalStore.getState().currentItem()
    expect(item?.title).toBe('New Title')
    expect(item?.description).toBe('A description')
  })
})
