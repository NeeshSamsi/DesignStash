import { ipcMain } from 'electron'
import {
  IPC_CONTRACT,
  type InvokeChannel,
  type IpcRequest,
  type IpcResponse,
  type IpcResult
} from '@shared/ipc'
import { ZodError } from 'zod'
import { logger } from '../logger'

/**
 * Register a typed IPC handler in the main process.
 * Validates both input (request) and output (response) against the shared zod schemas.
 */
export function registerIpcHandler<C extends InvokeChannel>(
  channel: C,
  handler: (args: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  ipcMain.handle(channel, async (_event, args): Promise<IpcResult<IpcResponse<C>>> => {
    try {
      const contract = IPC_CONTRACT[channel]

      const parsedRequest = contract.request.safeParse(args)
      if (!parsedRequest.success) {
        return {
          success: false,
          error: { code: 'INVALID_REQUEST', message: formatZodError(parsedRequest.error) }
        }
      }

      const result = await handler(parsedRequest.data as IpcRequest<C>)

      const parsedResponse = contract.response.safeParse(result)
      if (!parsedResponse.success) {
        logger.error(`[IPC] Response validation failed for ${channel}:`, parsedResponse.error)
        return {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Response validation failed' }
        }
      }

      return { success: true, data: parsedResponse.data as IpcResponse<C> }
    } catch (err) {
      logger.error(`[IPC] Error in handler for ${channel}:`, err)
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: err instanceof Error ? err.message : String(err)
        }
      }
    }
  })
}

function formatZodError(error: ZodError): string {
  // zod v4: issues live on `.issues`.
  return error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
}
