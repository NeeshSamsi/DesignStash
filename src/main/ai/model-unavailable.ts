/**
 * The active model can't run right now, though nothing is wrong with the mockup: Apple's model
 * after Apple Intelligence was switched off while the app runs. The queue waits instead of marking
 * the mockup as couldn't-write, and asks again once a model can run (H-1).
 */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelUnavailableError'
  }
}
