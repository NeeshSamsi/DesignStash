import {
  DndContext,
  useDroppable,
  useDraggable,
  type DragEndEvent
} from '@dnd-kit/core'
import { IPC_CHANNELS } from '@shared/ipc'
import { useGroupingStore } from './stores/groupingStore'
import type { GroupMember } from '@shared/grouping'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

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
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-muted">
        <img
          src={`file://${member.coverPath}`}
          alt={member.fileName}
          className="h-full w-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      </div>
      {member.isPrimary && (
        <Badge className="absolute left-1 top-1">Primary</Badge>
      )}
      <p className="w-full truncate text-center text-xs text-muted-foreground">{member.fileName}</p>
    </div>
  )
}

function GroupCard({ group }: { group: { id: string; members: GroupMember[]; confidence: 'high' | 'medium'; reason: 'folder' | 'stem' } }) {
  const disbandGroup = useGroupingStore((s) => s.disbandGroup)
  const { setNodeRef, isOver } = useDroppable({ id: group.id })

  return (
    <div className={`flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-card p-3 ${isOver ? 'ring-2 ring-ring' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant={group.confidence === 'high' ? 'default' : 'secondary'}>
            {group.confidence}
          </Badge>
          <Badge variant="outline">{group.reason}</Badge>
          <span className="text-xs text-muted-foreground">{group.members.length} items</span>
        </div>
        <Button variant="ghost" size="xs" onClick={() => disbandGroup(group.id)}>
          Disband
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className="flex min-h-24 flex-wrap gap-2 rounded-lg bg-muted/50 p-2"
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
    <div className="flex flex-1 flex-col gap-2 rounded-xl bg-card p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">Standalone</h3>
        <span className="text-xs text-muted-foreground">{singletons.length} items</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-wrap gap-2 rounded-lg bg-muted/50 p-2 ${isOver ? 'ring-2 ring-ring' : ''}`}
      >
        {singletons.map((member) => (
          <MockupTile key={member.mockupId} member={member} groupId="singletons" />
        ))}
        {singletons.length === 0 && (
          <p className="w-full self-center text-center text-xs text-muted-foreground">Drop tiles here</p>
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading grouping proposal…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Review Groups</h2>
          <p className="text-sm text-muted-foreground">
            Drag mockups between groups, then confirm to continue.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={store.isConfirming}>
            {store.isConfirming ? 'Confirming…' : 'Confirm'}
          </Button>
        </div>
      </header>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
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
