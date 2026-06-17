import { describe, it, expect } from 'vitest'
import { IPC_CONTRACT, IPC_CHANNELS } from './ipc'

describe('IPC Contract', () => {
  describe('APP_INFO channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.APP_INFO]

    it('validates a correct response', () => {
      const validResponse = {
        name: 'DesignStash',
        version: '1.0.0',
        env: 'development'
      }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })

    it('rejects an invalid env', () => {
      const invalidResponse = {
        name: 'DesignStash',
        version: '1.0.0',
        env: 'staging'
      }
      expect(() => response.parse(invalidResponse)).toThrow()
    })
  })

  describe('DB_PING channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.DB_PING]

    it('validates a correct response', () => {
      const validResponse = {
        success: true,
        message: 'pong',
        timestamp: Date.now()
      }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })
  })
})
