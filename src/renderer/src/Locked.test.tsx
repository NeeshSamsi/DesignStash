import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Locked from './Locked'
import { useEntitlementStore } from './stores/entitlementStore'

beforeEach(() => {
  useEntitlementStore.setState({ enabled: {}, loaded: false, tier: 'free' })
})

describe('Locked', () => {
  it('renders children when feature is enabled', () => {
    useEntitlementStore.setState({ enabled: { 'search.semantic': true }, loaded: true })
    render(<Locked feature="search.semantic"><span>FEATURE</span></Locked>)
    expect(screen.getByText('FEATURE')).toBeTruthy()
  })

  it('renders upsell and hides children when feature is disabled', () => {
    useEntitlementStore.setState({ enabled: { 'search.semantic': false }, loaded: true })
    render(<Locked feature="search.semantic"><span>FEATURE</span></Locked>)
    expect(screen.queryByText('FEATURE')).toBeNull()
    expect(screen.getByText(/Pro feature/i)).toBeTruthy()
  })
})
