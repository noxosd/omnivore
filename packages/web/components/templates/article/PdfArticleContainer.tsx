import { ArticleAttributes } from '../../../lib/networking/queries/useGetArticleQuery'
import { Box } from '../../elements/LayoutPrimitives'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactComponentElement,
} from 'react'
import { isDarkTheme } from '../../../lib/themeUpdater'
import PSPDFKit from 'pspdfkit'
import { Instance, HighlightAnnotation, List, Annotation, Rect } from 'pspdfkit'
import type { Highlight } from '../../../lib/networking/fragments/highlightFragment'
import { createHighlightMutation } from '../../../lib/networking/mutations/createHighlightMutation'
import { deleteHighlightMutation } from '../../../lib/networking/mutations/deleteHighlightMutation'
import { articleReadingProgressMutation } from '../../../lib/networking/mutations/articleReadingProgressMutation'
import { mergeHighlightMutation } from '../../../lib/networking/mutations/mergeHighlightMutation'
import { ShareHighlightModal } from './ShareHighlightModal'
import { useCanShareNative } from '../../../lib/hooks/useCanShareNative'
import { webBaseURL } from '../../../lib/appConfig'
import { pspdfKitKey } from '../../../lib/appConfig'
import { NotebookModal } from './NotebookModal'
import { HighlightNoteModal } from './HighlightNoteModal'
import { showErrorToast } from '../../../lib/toastHelpers'

export type PdfArticleContainerProps = {
  viewerUsername: string
  article: ArticleAttributes
  showHighlightsModal: boolean
  setShowHighlightsModal: React.Dispatch<React.SetStateAction<boolean>>
}

export default function PdfArticleContainer(
  props: PdfArticleContainerProps
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shareTarget, setShareTarget] = useState<Highlight | undefined>(
    undefined
  )
  const [notebookKey, setNotebookKey] = useState<string>(uuidv4())
  const [noteTarget, setNoteTarget] = useState<Highlight | undefined>(undefined)
  const [noteTargetPageIndex, setNoteTargetPageIndex] = useState<
    number | undefined
  >(undefined)
  const highlightsRef = useRef<Highlight[]>([])
  const canShareNative = useCanShareNative()

  const getHighlightURL = useCallback(
    (highlightID: string): string =>
      `${webBaseURL}/${props.viewerUsername}/${props.article.slug}/highlights/${highlightID}`,
    [props.article.slug, props.viewerUsername]
  )

  const nativeShare = useCallback(
    async (highlightID: string, title: string) => {
      await navigator?.share({
        title: title,
        url: getHighlightURL(highlightID),
      })
    },
    [getHighlightURL]
  )

  const handleOpenShare = useCallback(
    (highlight: Highlight) => {
      if (canShareNative) {
        nativeShare(highlight.shortId, props.article.title)
      } else {
        setShareTarget(highlight)
      }
    },
    [nativeShare, canShareNative, props.article.title]
  )

  const annotationOmnivoreId = (annotation: Annotation): string | undefined => {
    if (
      annotation &&
      annotation.customData &&
      annotation.customData.omnivoreHighlight &&
      (annotation.customData.omnivoreHighlight as Highlight).id
    ) {
      return (annotation.customData.omnivoreHighlight as Highlight).id
    }
    return undefined
  }

  useEffect(() => {
    let instance: Instance
    const container = containerRef.current
    ;(async function () {
      const ALLOWED_TOOLBAR_ITEM_TYPES = [
        'pager',
        'zoom-out',
        'zoom-in',
        'zoom-mode',
        'spacer',
        'search',
        'export-pdf',
      ]
      const toolbarItems = PSPDFKit.defaultToolbarItems.filter(
        (i) => ALLOWED_TOOLBAR_ITEM_TYPES.indexOf(i.type) !== -1
      )

      const positionPercentForAnnotation = (annotation: Annotation) => {
        let totalSize = 0
        let sizeBefore = 0
        for (let idx = 0; idx < annotation.pageIndex; idx++) {
          sizeBefore += instance.pageInfoForIndex(idx)?.height ?? 0
        }
        for (let idx = 0; idx < instance.totalPageCount; idx++) {
          totalSize += instance.pageInfoForIndex(idx)?.height ?? 0
        }
        return (sizeBefore + annotation.boundingBox.top) / totalSize
      }

      const annotationTooltipCallback = (annotation: Annotation) => {
        const highlightAnnotation = annotation as HighlightAnnotation
        const copy = {
          type: 'custom' as const,
          title: 'Copy',
          id: 'tooltip-copy-annotation',
          className: 'TooltipItem-Copy',
          onPress: async () => {
            const highlightText = await instance.getMarkupAnnotationText(
              highlightAnnotation
            )
            navigator.clipboard.writeText(highlightText)
            instance.setSelectedAnnotation(null)
          },
        }
        const remove = {
          type: 'custom' as const,
          title: 'Remove',
          id: 'tooltip-remove-annotation',
          className: 'TooltipItem-Remove',
          onPress: () => {
            instance
              .delete(annotation)
              .then(() => {
                const annotationId = annotationOmnivoreId(annotation)
                if (annotationId) {
                  return deleteHighlightMutation(annotationId)
                }
              })
              .catch((err) => {
                showErrorToast('Error deleting highlight: ' + err)
              })
          },
        }
        const note = {
          type: 'custom' as const,
          title: 'Note',
          id: 'tooltip-note-annotation',
          className: 'TooltipItem-Note',
          onPress: async () => {
            if (
              annotation.customData &&
              annotation.customData.omnivoreHighlight &&
              (annotation.customData.omnivoreHighlight as Highlight).shortId
            ) {
              const data = annotation.customData.omnivoreHighlight as Highlight
              const savedHighlight = highlightsRef.current.find(
                (other: Highlight) => {
                  return other.id === data.id
                }
              )
              data.annotation = savedHighlight?.annotation ?? data.annotation
              setNoteTargetPageIndex(annotation.pageIndex)
              setNoteTarget(data)
            }
            instance.setSelectedAnnotation(null)
          },
        }
        const share = {
          type: 'custom' as const,
          title: 'Share',
          id: 'tooltip-share-annotation',
          className: 'TooltipItem-Share',
          onPress: () => {
            if (
              annotation.customData &&
              annotation.customData.omnivoreHighlight &&
              (annotation.customData.omnivoreHighlight as Highlight).shortId
            ) {
              const data = annotation.customData.omnivoreHighlight as Highlight
              handleOpenShare(data)
            }
            instance.setSelectedAnnotation(null)
          },
        }
        return [copy, note, remove]
      }

      const annotationPresets = PSPDFKit.defaultAnnotationPresets
      annotationPresets.highlight = {
        opacity: 0.45,
        color: new PSPDFKit.Color({ r: 255, g: 210, b: 52 }),
        blendMode: PSPDFKit.BlendMode.multiply,
      }

      instance = await PSPDFKit.load({
        container: container || '.pdf-container',
        toolbarItems,
        annotationPresets,
        document: props.article.url,
        theme: isDarkTheme() ? PSPDFKit.Theme.DARK : PSPDFKit.Theme.LIGHT,
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
        licenseKey: pspdfKitKey,
        styleSheets: ['/static/pspdfkit-lib.css'],
        annotationTooltipCallback: annotationTooltipCallback,
        initialViewState: new PSPDFKit.ViewState({
          zoom: PSPDFKit.ZoomMode.FIT_TO_WIDTH,
          currentPageIndex: props.article.readingProgressAnchorIndex || 0,
        }),
      })

      instance.addEventListener('annotations.willChange', async (event) => {
        const annotation = event.annotations.get(0)
        if (
          !annotation ||
          event.reason !== PSPDFKit.AnnotationsWillChangeReason.DELETE_END
        ) {
          return
        }
        const annotationId = annotationOmnivoreId(annotation)
        if (annotationId) {
          await deleteHighlightMutation(annotationId)
        }
      })

      // Store the highlights in the highlightsRef and apply them to the PDF
      highlightsRef.current = props.article.highlights
      for (const highlight of props.article.highlights) {
        const patch = JSON.parse(highlight.patch)
        if (highlight.annotation && patch.customData.omnivoreHighight) {
          patch.customData.omnivoreHighight.annotation = highlight.annotation
        }

        const annotation = PSPDFKit.Annotations.fromSerializableObject(patch)

        try {
          await instance.create(annotation)
        } catch (e) {
          console.log('error adding highlight')
          console.log(e)
        }
      }

      const findOverlappingHighlights = async (
        instance: Instance,
        highlightAnnotation: HighlightAnnotation
      ): Promise<List<Annotation>> => {
        const existing = await instance.getAnnotations(
          highlightAnnotation.pageIndex
        )

        const highlights = existing.filter((annotation) => {
          return (
            annotation instanceof PSPDFKit.Annotations.HighlightAnnotation &&
            annotation.customData &&
            annotation.customData.omnivoreHighlight
          )
        })

        const overlapping = highlights.filter((annotation) => {
          const isRes = annotation.rects.some((rect: Rect) => {
            return highlightAnnotation.rects.some((highlightRect) => {
              return rect.isRectOverlapping(highlightRect)
            })
          })
          return isRes
        })

        return overlapping
      }

      instance.addEventListener(
        'annotations.create',
        async (createdAnnotations) => {
          const highlightAnnotation = createdAnnotations.get(0)

          if (
            !(
              highlightAnnotation instanceof
              PSPDFKit.Annotations.HighlightAnnotation
            )
          ) {
            return
          }

          // If the annotation already has the omnivore highlight
          // custom data its already been created, so we can
          // ignore this event.
          if (
            highlightAnnotation.customData &&
            highlightAnnotation.customData.omnivoreHighlight
          ) {
            // This highlight has already been created, so we skip adding it
            return
          }

          const overlapping = await findOverlappingHighlights(
            instance,
            highlightAnnotation
          )

          const id = uuidv4()
          const shortId = nanoid(8)
          const quote = (
            await instance.getMarkupAnnotationText(highlightAnnotation)
          )
            .replace(/(\r\n|\n|\r)/gm, ' ')
            .trim()

          const surroundingText = { prefix: '', suffix: '' }
          const annotation = highlightAnnotation.set('customData', {
            omnivoreHighlight: {
              id,
              quote,
              shortId,
              prefix: surroundingText.prefix,
              suffix: surroundingText.suffix,
              articleId: props.article.id,
            },
          })

          await instance.update(annotation)
          const serialized =
            PSPDFKit.Annotations.toSerializableObject(annotation)

          if (overlapping.size === 0) {
            const positionPercent = positionPercentForAnnotation(annotation)
            const result = await createHighlightMutation({
              id: id,
              shortId: shortId,
              quote: quote,
              articleId: props.article.id,
              prefix: surroundingText.prefix,
              suffix: surroundingText.suffix,
              patch: JSON.stringify(serialized),
              highlightPositionPercent: positionPercent * 100,
              highlightPositionAnchorIndex: annotation.pageIndex,
            })
            if (result) {
              highlightsRef.current.push(result)
            }
          } else {
            // Create a new single highlight in the PDF
            const rects = highlightAnnotation.rects.concat(
              overlapping.flatMap((ha) => ha.rects as List<Rect>)
            )
            const annotation = new PSPDFKit.Annotations.HighlightAnnotation({
              pageIndex: highlightAnnotation.pageIndex,
              rects: rects,
              opacity: 0.45,
              color: new PSPDFKit.Color({ r: 255, g: 210, b: 52 }),
              boundingBox: PSPDFKit.Geometry.Rect.union(rects),
              customData: {
                omnivoreHighlight: {
                  id,
                  quote,
                  shortId,
                  prefix: surroundingText.prefix,
                  suffix: surroundingText.suffix,
                  articleId: props.article.id,
                },
              },
            })

            await instance.create(annotation)
            await instance.delete(overlapping)
            await instance.delete(highlightAnnotation)

            const mergedIds = overlapping.map(
              (ha) => (ha.customData?.omnivoreHighlight as Highlight).id
            )
            const positionPercent = positionPercentForAnnotation(annotation)
            const result = await mergeHighlightMutation({
              quote,
              id,
              shortId,
              patch: JSON.stringify(serialized),
              prefix: surroundingText.prefix,
              suffix: surroundingText.suffix,
              articleId: props.article.id,
              overlapHighlightIdList: mergedIds.toArray(),
              highlightPositionPercent: positionPercent * 100,
              highlightPositionAnchorIndex: annotation.pageIndex,
            })
            if (result) {
              highlightsRef.current.push(result)
            }
          }
        }
      )

      instance.addEventListener(
        'viewState.currentPageIndex.change',
        async (pageIndex) => {
          const percent = Math.min(
            100,
            Math.max(0, ((pageIndex + 1) / instance.totalPageCount) * 100)
          )
          if (percent <= props.article.readingProgressPercent) {
            return
          }
          await articleReadingProgressMutation({
            id: props.article.id,
            readingProgressPercent: percent,
            readingProgressAnchorIndex: pageIndex,
          })
        }
      )
    })()

    document.addEventListener('deleteHighlightbyId', async (event) => {
      const annotationId = (event as CustomEvent).detail as string
      for (let pageIdx = 0; pageIdx < instance.totalPageCount; pageIdx++) {
        const annotations = await instance.getAnnotations(pageIdx)
        for (let annIdx = 0; annIdx < annotations.size; annIdx++) {
          const annotation = annotations.get(annIdx)
          if (!annotation) {
            continue
          }
          const storedId = annotationOmnivoreId(annotation)
          if (storedId == annotationId) {
            await instance.delete(annotation)
            await deleteHighlightMutation(annotationId)

            const highlightIdx = highlightsRef.current.findIndex((value) => {
              return value.id == annotationId
            })
            if (highlightIdx > -1) {
              highlightsRef.current.splice(highlightIdx, 1)
            }
            // This is needed to force the notebook to reload the highlights
            setNotebookKey(uuidv4())
          }
        }
      }
    })

    return () => {
      PSPDFKit && container && PSPDFKit.unload(container)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // We are intentially not setting exhaustive deps here, we only want to reload
  // the PSPDFKit instance if the theme, article URL, or page URL changes. Everything else
  // should be handled by the PSPDFKit instance callbacks.

  return (
    <Box css={{ width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {shareTarget && (
        <ShareHighlightModal
          url={getHighlightURL(shareTarget.shortId)}
          title={props.article.title}
          author={props.article.author}
          highlight={shareTarget}
          onOpenChange={() => {
            setShareTarget(undefined)
          }}
        />
      )}
      {noteTarget && (
        <HighlightNoteModal
          highlight={noteTarget}
          author={props.article.author ?? ''}
          title={props.article.title}
          onUpdate={(highlight: Highlight) => {
            const savedHighlight = highlightsRef.current.find(
              (other: Highlight) => {
                return other.id == highlight.id
              }
            )

            if (savedHighlight) {
              savedHighlight.annotation = highlight.annotation
            }
          }}
          onOpenChange={() => {
            setNoteTarget(undefined)
          }}
        />
      )}
      {props.showHighlightsModal && (
        <NotebookModal
          key={notebookKey}
          highlights={highlightsRef.current}
          onOpenChange={() => props.setShowHighlightsModal(false)}
          /* eslint-disable @typescript-eslint/no-empty-function */
          updateHighlight={() => {}}
          deleteHighlightAction={(highlightId: string) => {
            const event = new CustomEvent('deleteHighlightbyId', {
              detail: highlightId,
            })
            document.dispatchEvent(event)
          }}
        />
      )}
    </Box>
  )
}
