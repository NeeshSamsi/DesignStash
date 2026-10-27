import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

export const UpdateStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('up-to-date'), lastCheckedAt: z.string().nullable() }),
  /**
   * A newer release exists. While builds are unsigned the app cannot install it, so `releaseUrl`
   * is the page to download it from; `notes` is the release's changelog (markdown, may be empty).
   */
  z.object({
    state: z.literal('available'),
    version: z.string(),
    notes: z.string(),
    releaseUrl: z.string(),
    lastCheckedAt: z.string().nullable()
  }),
  /** The last check could not reach GitHub (offline, rate limited). Never an error dialog. */
  z.object({ state: z.literal('check-failed'), lastCheckedAt: z.string().nullable() }),
  z.object({
    state: z.literal('downloading'),
    version: z.string(),
    progress: z.number(),
    lastCheckedAt: z.string().nullable()
  }),
  z.object({ state: z.literal('ready'), version: z.string(), lastCheckedAt: z.string().nullable() })
])

export type UpdateStatus = z.infer<typeof UpdateStatusSchema>

/** Longest message and stack a renderer error report carries; the renderer cuts to these. */
export const RENDERER_ERROR_LIMITS = { name: 200, message: 2000, stack: 16000 } as const

/**
 * Something the window threw: a crash caught by the error boundary (`render`), an uncaught error
 * (`error`) or an unhandled rejection (`rejection`). Main scrubs the paths.
 */
export const RendererErrorReportSchema = z.object({
  source: z.enum(['render', 'error', 'rejection']),
  name: z.string().max(RENDERER_ERROR_LIMITS.name),
  message: z.string().max(RENDERER_ERROR_LIMITS.message),
  stack: z.string().max(RENDERER_ERROR_LIMITS.stack).optional(),
  componentStack: z.string().max(RENDERER_ERROR_LIMITS.stack).optional()
})

export type RendererErrorReport = z.infer<typeof RendererErrorReportSchema>

/** App info and health. */
export const appContract = {
  [IPC_CHANNELS.APP_INFO]: {
    request: z.void(),
    response: z.object({
      name: z.string(),
      version: z.string(),
      env: z.enum(['development', 'production', 'test'])
    })
  },
  [IPC_CHANNELS.APP_RELAUNCH]: {
    request: z.void(),
    response: z.object({ relaunching: z.boolean() })
  },
  /** The crash screen's Reload: reloads the window. */
  [IPC_CHANNELS.APP_RELOAD]: { request: z.void(), response: z.object({ reloading: z.boolean() }) },
  [IPC_CHANNELS.APP_QUIT]: { request: z.void(), response: z.object({ quitting: z.boolean() }) },
  /** Fire and forget: main logs the report and, with consent, sends it as an exception. */
  [IPC_CHANNELS.APP_RENDERER_ERROR]: { request: RendererErrorReportSchema, response: z.void() },
  [IPC_CHANNELS.UPDATES_STATUS]: { request: z.void(), response: UpdateStatusSchema },
  [IPC_CHANNELS.UPDATES_CHECK]: { request: z.void(), response: UpdateStatusSchema },
  [IPC_CHANNELS.UPDATES_CANCEL]: { request: z.void(), response: UpdateStatusSchema },
  [IPC_CHANNELS.UPDATES_INSTALL]: {
    request: z.void(),
    response: z.object({ installing: z.boolean() })
  },
  [IPC_CHANNELS.LICENCES_TEXT]: { request: z.void(), response: z.object({ text: z.string() }) },
  /**
   * "Report a problem". No request (or `copy`) copies the short facts report. `preview` returns the
   * full text that Send would carry (facts plus log tail) without sending or copying. `send` posts
   * `message` with that text to PostHog; `copy-full` puts message and text on the clipboard.
   */
  [IPC_CHANNELS.REPORT_COPY]: {
    request: z
      .object({
        action: z.enum(['copy', 'preview', 'send', 'copy-full']),
        message: z.string().max(20000).optional()
      })
      .optional(),
    response: z.object({
      copied: z.boolean(),
      text: z.string().optional(),
      outcome: z.enum(['sent', 'queued', 'unavailable']).optional()
    })
  }
} as const
