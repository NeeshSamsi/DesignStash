import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { createTestDb } from './__tests__/setup'

let sqlite: Database.Database
let repo: Repository

beforeEach(() => {
  ;({ sqlite, repo } = createTestDb())
})

afterEach(() => sqlite.close())

const haulWithJob = () => {
  repo.copyJobs.createHaul('h1', [], 0)
  repo.copyJobs.addJobs('h1', [{ sourcePath: '/drop/a.psd', fileName: 'a.psd', folderTrail: [], sizeBytes: 1 }])
  return repo.copyJobs.getJobs('h1')[0]!
}

describe('haul state', () => {
  it('holds a pause reason only while paused', () => {
    haulWithJob()
    repo.copyJobs.setHaulState('h1', { state: 'paused', pauseReason: 'disk-full' })
    expect(repo.copyJobs.getHaul('h1')).toMatchObject({ state: 'paused', pauseReason: 'disk-full' })

    repo.copyJobs.setHaulState('h1', { state: 'running' })
    expect(repo.copyJobs.getHaul('h1')).toMatchObject({ state: 'running', pauseReason: null })

    repo.copyJobs.setHaulState('h1', { state: 'paused', pauseReason: 'source-gone' })
    repo.copyJobs.setHaulState('h1', { state: 'cancelled' })
    expect(repo.copyJobs.getHaul('h1')).toMatchObject({ state: 'cancelled', pauseReason: null })
  })

  it('does not take a state through updateHaul', () => {
    haulWithJob()
    // @ts-expect-error state is written through setHaulState
    repo.copyJobs.updateHaul('h1', { state: 'done' })
    // @ts-expect-error a pause reason is written through setHaulState
    repo.copyJobs.updateHaul('h1', { pauseReason: 'disk-full' })
  })
})

describe('job state', () => {
  it('holds a skip reason only while skipped and a mockup only once done', () => {
    const job = haulWithJob()
    repo.copyJobs.setJobState(job.id, { status: 'skipped', skipReason: 'duplicate' })
    expect(repo.copyJobs.getJob(job.id)).toMatchObject({ status: 'skipped', skipReason: 'duplicate', sourcePath: '' })

    repo.copyJobs.setJobState(job.id, { status: 'queued' })
    expect(repo.copyJobs.getJob(job.id)).toMatchObject({ status: 'queued', skipReason: null, mockupId: null })
  })

  it('clears the way back to a file once it is done', () => {
    const job = haulWithJob()
    repo.copyJobs.setJobState(job.id, { status: 'done', mockupId: 7 })
    expect(repo.copyJobs.getJob(job.id)).toMatchObject({ status: 'done', mockupId: 7, skipReason: null, sourcePath: '' })
  })

  it('leaves the way back to a file while it is copying', () => {
    const job = haulWithJob()
    repo.copyJobs.setJobState(job.id, { status: 'copying' })
    expect(repo.copyJobs.getJob(job.id)).toMatchObject({ status: 'copying', sourcePath: '/drop/a.psd' })
  })

  it('does not take a status through updateJob', () => {
    const job = haulWithJob()
    // @ts-expect-error status is written through setJobState
    repo.copyJobs.updateJob(job.id, { status: 'done' })
    // @ts-expect-error a skip reason is written through setJobState
    repo.copyJobs.updateJob(job.id, { skipReason: 'duplicate' })
  })
})
