import {
  DndContext,
  useDroppable,
  useDraggable,
  type DragEndEvent
} from '@dnd-kit/core'
import { IPC_CHANNELS } from '@shared/ipc'
import { useGroupingStore } from './stores/groupingStore'
import type { GroupMember } from '@shared/grouping'

interface GroupingReviewProps {
  onConfirm: () => void
  onCancel: () => void
}

function MockupTile({ member, groupId }: { member: GroupMember; groupId: string | 'singletons' }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: member.mockupId,
    data: { groupId }
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`relative flex flex-col items-center gap-1 w-20 cursor-grab select-none ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="w-20 h-20 bg-neutral-700 rounded-lg overflow-hidden flex items-center justify-center">
        <img
          src={`file://${member.coverPath}`}
          alt={member.fileName}
          className="w-full h-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      </div>
      {member.isPrimary && (
        <span className="absolute top-1 left-1 text-xs bg-blue-600 text-white px-1 py-0.5 rounded leading-none">
          Primary
        </span>
      )}
      <p className="text-xs text-neutral-400 text-center truncate w-full">{member.fileName}</p>
    </div>
  )
}

function GroupCard({ group }: { group: { id: string; members: GroupMember[]; confidence: 'high' | 'medium'; reason: 'folder' | 'stem' } }) {
  const disbandGroup = useGroupingStore((s) => s.disbandGroup)
  const { setNodeRef, isOver } = useDroppable({ id: group.id })

  return (
    <div className={`bg-neutral-800 rounded-xl p-3 w-64 shrink-0 flex flex-col gap-2 ${isOver ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium ${group.confidence === 'high' ? 'bg-green-700 text-green-200' : 'bg-yellow-700 text-yellow-200'}`}
          >
            {group.confidence}
          </span>
          <span className="text-xs bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">
            {group.reason}
          </span>
          <span className="text-xs text-neutral-400">{group.members.length} items</span>
        </div>
        <button
          onClick={() => disbandGroup(group.id)}
          className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
        >
          Disband
        </button>
      </div>
      <div
        ref={setNodeRef}
        className="flex flex-wrap gap-2 min-h-24 rounded-lg p-2 bg-neutral-700/50"
      >
        {group.members.map((member) => (
          <MockupTile key={member.mockupId} member={member} groupId={group.id} />
        ))}
      </div>
    </div>
  )
}

function SingletonsTray({ singletons }: { singletons: GroupMember[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'singletons' })

  return (
    <div className="flex-1 bg-neutral-800 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-300">Standalone</h3>
        <span className="text-xs text-neutral-500">{singletons.length} items</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-wrap gap-2 min-h-24 rounded-lg p-2 bg-neutral-700/50 ${isOver ? 'ring-2 ring-blue-500' : ''}`}
      >
        {singletons.map((member) => (
          <MockupTile key={member.mockupId} member={member} groupId="singletons" />
        ))}
        {singletons.length === 0 && (
          <p className="text-xs text-neutral-600 self-center w-full text-center">Drop tiles here</p>
        )}
      </div>
    </div>
  )
}

export default function GroupingReview({ onConfirm, onCancel }: GroupingReviewProps) {
  const store = useGroupingStore()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const mockupId = active.id as number
    const target = over.id as string
    if (target === 'singletons') store.moveMockupToSingletons(mockupId)
    else store.moveMockupToGroup(mockupId, target)
  }

  const handleConfirm = async () => {
    store.setConfirming(true)
    const request = {
      batchId: store.batchId!,
      groups: store.groups.map((g) => ({ id: g.id, memberIds: g.members.map((m) => m.mockupId) })),
      singletonIds: store.singletons.map((m) => m.mockupId)
    }
    const res = await window.api.invoke(IPC_CHANNELS.GROUPING_CONFIRM, request)
    store.setConfirming(false)
    if (res.success) onConfirm()
  }

  if (store.isLoading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-neutral-400">Loading grouping proposal…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      <header className="border-b border-neutral-700 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">Review Groups</h2>
          <p className="text-sm text-neutral-400">
            Drag mockups between groups, then confirm to continue.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="text-sm bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={store.isConfirming}
            className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {store.isConfirming ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </header>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {store.groups.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {store.groups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
          <SingletonsTray singletons={store.singletons} />
        </div>
      </DndContext>
    </div>
  )
}
