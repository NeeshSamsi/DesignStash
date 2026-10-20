import { ArrowExpandIcon } from '@hugeicons/core-free-icons'
import { coverUrl } from '@shared/cover-url'
import { Button } from '@renderer/components/Button'
import { ErrorState } from '@renderer/components/ErrorState'
import { MockupCard } from '@renderer/components/MockupCard'
import { Tooltip } from '@renderer/components/Tooltip'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { detailsCaption, mockupsLabel, pileOrder } from './details-model'
import { PhotoshopAsk, SidebarActions, SidebarHeader } from './SidebarParts'
import { SidebarLoading } from './SingleView'
import type { useDetailsData } from './use-details-data'

type Data = ReturnType<typeof useDetailsData>

/**
 * A pile in the details sidebar (Figma D2.3 B1): its mockups as compact cards, the top one first.
 * A card opens the pile page on that mockup. Disband pile sits above Edit pile details.
 */
export function PileView({ data }: { data: Data }) {
  const item = data.detail?.item
  if (data.status === 'error') {
    return (
      <>
        <SidebarHeader caption="Pile" />
        <ErrorState
          variant="inline"
          title="Couldn’t open this pile"
          message="Try again in a moment."
          showDetails={false}
          retryLabel="Try again"
          onRetry={data.retry}
          secondaryLabel={null}
        />
      </>
    )
  }
  if (!item || !data.detail || data.status === 'loading') return <SidebarLoading />

  const variants = pileOrder(data.detail.variants)
  const count = variants.length
  const open = (select: number, edit = false) =>
    useDetailsStore.getState().openPile({ id: item.id, title: item.title, count, select, edit })
  const caption = detailsCaption({ ...item, variantCount: Math.max(0, count - 1) }, 'pile')

  return (
    <>
      <SidebarHeader title={item.title} caption={caption}>
        <Tooltip label="Open pile page" arrow="top-right">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open pile page"
            iconStart={ArrowExpandIcon}
            showIconStart
            onClick={() => open(item.id)}
          />
        </Tooltip>
      </SidebarHeader>

      <div
        aria-label={mockupsLabel(count)}
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto"
      >
        {variants.map((variant) => (
          <MockupCard
            key={variant.id}
            variant="compact"
            title={variant.title}
            tags={variant.isTop ? 'Top' : ''}
            showTags={variant.isTop}
            showFavourite={false}
            showVariants={false}
            state={variant.coverMissing ? 'cover-missing' : 'default'}
            {...(variant.coverPath
              ? { coverSrc: coverUrl(variant.coverPath, data.coverVersion) }
              : {})}
            className="w-full cursor-pointer"
            onClick={() => open(variant.id)}
            onOpenInPhotoshop={() => void data.openInPhotoshop(variant.id)}
          />
        ))}
      </div>

      <SidebarActions>
        <Button
          variant="ghost"
          label="Disband pile"
          className="w-full"
          onClick={() => void data.disband()}
        />
        <Button
          variant="secondary"
          label="Edit pile details"
          className="w-full"
          onClick={() => open(item.id, true)}
        />
      </SidebarActions>

      <PhotoshopAsk
        failure={data.photoshop}
        onCancel={data.dismissPhotoshop}
        onRetry={() => data.dismissPhotoshop()}
      />
    </>
  )
}
