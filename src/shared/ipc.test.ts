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

  describe('IMPORT_START channel', () => {
    const { request, response } = IPC_CONTRACT[IPC_CHANNELS.IMPORT_START]

    it('validates a correct request', () => {
      const validRequest = { paths: ['/path/to/file.psd'] }
      expect(request.parse(validRequest)).toEqual(validRequest)
    })

    it('validates a correct response', () => {
      const validResponse = {
        batchId: '123',
        items: [],
        imported: 0,
        pendingPreview: 0,
        duplicates: 0,
        errors: 0,
        skippedNonPsd: 0
      }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })
  })

  describe('IMPORT_PROGRESS channel', () => {
    const { request } = IPC_CONTRACT[IPC_CHANNELS.IMPORT_PROGRESS]

    it('validates a correct request', () => {
      const validRequest = {
        batchId: '123',
        phase: 'copying',
        completed: 1,
        total: 2,
        currentTitle: 'file.psd'
      }
      expect(request.parse(validRequest)).toEqual(validRequest)
    })
  })

  describe('IMPORT_CANCEL channel', () => {
    const { request, response } = IPC_CONTRACT[IPC_CHANNELS.IMPORT_CANCEL]

    it('validates a correct request', () => {
      const validRequest = { batchId: '123' }
      expect(request.parse(validRequest)).toEqual(validRequest)
    })

    it('validates a correct response', () => {
      const validResponse = { cancelled: true }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })
  })
})
