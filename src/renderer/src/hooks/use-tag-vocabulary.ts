import { useCallback, useEffect, useState } from 'react'
import type { ApprovalTag } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import type { NewTagRequest, TagVocabularyCategory } from '../components/TagEditor'
import { toast } from '../stores/toastStore'

/**
 * Every existing tag by category with use counts (what typing in a TagEditor matches against), and the
 * create handler that makes the category first when it is new. A failure toasts plain words and rethrows.
 */
export function useTagVocabulary() {
  const [vocabulary, setVocabulary] = useState<TagVocabularyCategory[]>([])

  useEffect(() => {
    void window.api.invoke(IPC_CHANNELS.TAG_TREE, undefined).then((res) => {
      if (res.success) setVocabulary(res.data.tree)
    })
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
      const known = categoryId
      const entry = { tagId: created.data.tagId, label: created.data.label, usageCount: 0 }
      setVocabulary((current) =>
        current.some((c) => c.categoryId === known)
          ? current.map((c) => (c.categoryId === known ? { ...c, tags: [...c.tags, entry] } : c))
          : [...current, { categoryId: known, categoryLabel: request.categoryLabel, tags: [entry] }]
      )
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
