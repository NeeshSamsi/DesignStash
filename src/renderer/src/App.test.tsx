import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => {
  // Provide a stub preload bridge — jsdom has no real `window.api`.
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === 'app:info') {
        return { success: true, data: { name: 'DesignStash', version: '0.0.0', env: 'test' } }
      }
      return { success: true, data: { success: true, message: 'pong', timestamp: 0 } }
    })
  } as unknown as typeof window.api
})

describe('App', () => {
  it('renders the app title', async () => {
    render(<App />)
    expect(await screen.findByText('DesignStash')).toBeTruthy()
  })
})
