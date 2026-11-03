import { useCallback, useEffect, useMemo } from 'react'
import type { ApprovalTag } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import type { NewTagRequest, TagVocabularyCategory } from '../components/TagEditor'
import { useTagTreeStore } from '../stores/tagTreeStore'
import { toast } from '../stores/toastStore'

/**
 * Every existing tag by category with use counts (what typing in a TagEditor matches against), and the
 * create handler that makes the category first when it is new. A failure toasts plain words and rethrows.
 */
export function useTagVocabulary() {
  const tree = useTagTreeStore((s) => s.tree)
  const vocabulary = useMemo<TagVocabularyCategory[]>(() => tree ?? [], [tree])

  useEffect(() => {
    void useTagTreeStore.getState().load()
  }, [])

  const createTag = useCallback(async (request: NewTagRequest): Promise<ApprovalTag> => {
    try {
      let categoryId = request.categoryId
      if (categoryId === null) {
        const category = await window.api.invoke(IPC_CHANNELS.CATEGORY_CREATE, {
          label: request.categoryLabel
        })
        if (!category.success) throw new Error('category')
        categoryId = category.data.categoryId
      }
      const created = await window.api.invoke(IPC_CHANNELS.TAG_CREATE, {
        label: request.label,
        categoryId
      })
      if (!created.success) throw new Error('tag')
      const { addTag, load } = useTagTreeStore.getState()
      addTag(
        { categoryId, categoryLabel: request.categoryLabel },
        { tagId: created.data.tagId, label: created.data.label }
      )
      void load()
      return {
        tagId: created.data.tagId,
        label: created.data.label,
        categoryId: created.data.categoryId,
        categoryLabel: request.categoryLabel
      }
    } catch (error) {
      toast({
        variant: 'error',
        message: 'Couldn’t add that tag',
        description: 'Try again in a moment.'
      })
      throw error
    }
  }, [])

  return { vocabulary, createTag }
}
