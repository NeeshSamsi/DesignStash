import type { DesignStashApi } from '@shared/api'

declare global {
  interface Window {
    api: DesignStashApi
  }
}

export {}
