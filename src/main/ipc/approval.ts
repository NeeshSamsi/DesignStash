import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { ApprovalService } from '../import/approval-service'
import { TagService } from '../db/tag-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerApprovalHandlers({ settings, telemetry, repo, ai }: HandlerContext): void {
  registerIpcHandler(IPC_CHANNELS.APPROVAL_INIT, async (args) => {
    const service = new ApprovalService(repo, await ai.activeProvider(), new TagService(repo))
    return service.initQueue(args.batchId)
  })

  registerIpcHandler(IPC_CHANNELS.APPROVAL_SAVE_ITEM, async (args) => {
    repo.approveItem(args.mockupId, {
      title: args.title,
      description: args.description,
      coverPath: args.coverPath,
      coverSource: args.coverSource,
      reviewStatus: 'approved'
    })
    repo.clearTagsForMockup(args.mockupId)
    for (const tagId of args.tagIds) {
      repo.addTagToMockup(args.mockupId, tagId)
    }
    repo.upsertSearchIndex(args.mockupId)

    let reinferredItems = undefined
    if (args.isLeader && args.wasEdited && args.leaderId === null) {
      const groupMembers = repo.getMockupsByGroupId(args.mockupId)
      if (groupMembers.length > 0) {
        const service = new ApprovalService(repo, await ai.activeProvider(), new TagService(repo))
        const memberItems = await service.initQueue_membersOnly(groupMembers)
        reinferredItems = await service.reinferGroupRemainder(memberItems, args)
      }
    }

    // Telemetry: booleans only — never title/description/tag text or filenames.
    telemetry.get().track(TELEMETRY_EVENTS.AI_ITEM_APPROVED, {
      wasEdited: args.wasEdited,
      isLeader: args.isLeader
    })

    return { saved: true, reinferredItems }
  })

  registerIpcHandler(IPC_CHANNELS.APPROVAL_SET_COVER, async (args) => {
    const mockup = repo.getMockup(args.mockupId)
    if (!mockup) throw new Error(`Mockup ${args.mockupId} not found`)

    const coversDir = join(settings.getLibraryRoot(), 'covers')
    await fs.mkdir(coversDir, { recursive: true })
    const ext = args.filePath.split('.').pop() ?? 'png'
    const destFileName = `${args.mockupId}-user.${ext}`
    const destPath = join(coversDir, destFileName)
    await fs.copyFile(args.filePath, destPath)

    repo.setMockupCover(args.mockupId, destPath, 'user-uploaded')
    return { coverPath: destPath, coverSource: 'user-uploaded' as const }
  })
}
