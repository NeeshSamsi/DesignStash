import type { InferenceProvider, AnalysisInput, InferenceResult } from './inference'

/**
 * A predictable, non-AI provider for tests and CI.
 */
export class MockInferenceProvider implements InferenceProvider {
  readonly id = 'mock-provider'
  readonly name = 'Mock Provider (Offline)'

  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    // Simulate a short processing delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    const isNested = input.folderTrail.length > 0
    const contextHint = isNested ? ` [from ${input.folderTrail.join('/')}]` : ''

    return {
      title: `${input.fileName.replace(/\.psd$/i, '')} Mockup`,
      description: `A professionally rendered mockup of ${input.fileName}.${contextHint}`,
      tags: [
        { category: 'Device', label: 'MacBook' },
        { category: 'Context', label: 'Workplace' }
      ]
    }
  }
}
