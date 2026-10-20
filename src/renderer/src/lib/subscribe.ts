import { PUSH_CONTRACT, type PushChannel, type PushPayload } from '@shared/ipc'

/**
 * Listen to a main -> renderer push event with its payload validated against the channel's
 * zod schema. Payloads that fail validation are dropped. Returns the unsubscribe function.
 */
export function subscribePush<C extends PushChannel>(
  channel: C,
  callback: (payload: PushPayload<C>) => void
): () => void {
  const schema = PUSH_CONTRACT[channel].payload
  return window.api.subscribe(channel, (raw) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      console.error(`[IPC] Invalid push payload on ${channel}:`, parsed.error)
      return
    }
    callback(parsed.data as PushPayload<C>)
  })
}
