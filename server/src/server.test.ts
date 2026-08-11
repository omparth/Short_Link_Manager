import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { app, Link, Click } from './server.js'

let mongo: MongoMemoryServer
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()) })
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(async () => { await Link.deleteMany({}); await Click.deleteMany({}) })
const create = (body: any) => request(app).post('/api/links').send(body)

describe('Shortlink API', () => {
  it('creates valid, random, custom, and unlimited links', async () => {
    const random = await create({ destinationUrl: 'https://example.com/a', clickCap: 5 })
    expect(random.status).toBe(201); expect(random.body.slug).toBeTruthy(); expect(random.body.destinationUrl).toBe('https://example.com/a')
    const custom = await create({ destinationUrl: 'https://example.com/b', slug: 'spring', clickCap: null })
    expect(custom.status).toBe(201); expect(custom.body.slug).toBe('spring'); expect(custom.body.clickCap).toBeNull()
  })
  it('rejects invalid URL and cap', async () => {
    expect((await create({ destinationUrl: 'javascript:alert(1)', clickCap: 1 })).status).toBe(400)
    expect((await create({ destinationUrl: 'https://example.com', clickCap: 0 })).status).toBe(400)
  })
  it('returns 409 for duplicate slugs, including concurrent creation', async () => {
    expect((await create({ destinationUrl: 'https://example.com', slug: 'same', clickCap: 1 })).status).toBe(201)
    expect((await create({ destinationUrl: 'https://example.org', slug: 'same', clickCap: 1 })).status).toBe(409)
    const results = await Promise.all([1, 2, 3].map(() => create({ destinationUrl: 'https://example.net', slug: 'race', clickCap: 1 })))
    expect(results.filter(r => r.status === 201)).toHaveLength(1)
    expect(results.filter(r => r.status === 409)).toHaveLength(2)
  })
  it('redirects, records referrer, and rejects disabled or capped links', async () => {
    const made = await create({ destinationUrl: 'https://example.com/target', slug: 'gox', clickCap: 1 })
    const first = await request(app).get('/r/gox').set('Referer', 'https://referrer.test/page')
    expect(first.status).toBe(302); expect(first.headers.location).toBe('https://example.com/target')
    const link = await Link.findById(made.body.id); expect(link?.clickCount).toBe(1); expect(await Click.countDocuments({ linkId: made.body.id })).toBe(1); expect((await Click.findOne()).referrer).toBe('https://referrer.test/page')
    expect((await request(app).get('/r/gox')).status).toBe(410); expect(await Click.countDocuments({ linkId: made.body.id })).toBe(1)
    const disabled = await create({ destinationUrl: 'https://example.com/disabled', slug: 'off', clickCap: 5 }); await request(app).patch(`/api/links/${disabled.body.id}/disable`); expect((await request(app).get('/r/off')).status).toBe(410)
  })
  it('enforces search and pagination on the server', async () => {
    await create({ destinationUrl: 'https://example.com/one', slug: 'one', clickCap: 1 }); await create({ destinationUrl: 'https://example.com/two', slug: 'two', clickCap: 1 }); await create({ destinationUrl: 'https://other.test/three', slug: 'three', clickCap: 1 })
    const search = await request(app).get('/api/links?search=other&page=1&pageSize=2'); expect(search.body.total).toBe(1); expect(search.body.items[0].slug).toBe('three')
    const page = await request(app).get('/api/links?page=2&pageSize=2'); expect(page.body.page).toBe(2); expect(page.body.pageSize).toBe(2); expect(page.body.totalPages).toBe(2); expect(page.body.items).toHaveLength(1)
  })
  it('deletes links and associated clicks atomically', async () => {
    const made = await create({ destinationUrl: 'https://example.com', slug: 'delete-me', clickCap: 5 }); await request(app).get('/r/delete-me'); expect(await Click.countDocuments()).toBe(1)
    expect((await request(app).delete(`/api/links/${made.body.id}`)).status).toBe(204); expect(await Link.exists({ _id: made.body.id })).toBeFalsy(); expect(await Click.countDocuments()).toBe(0)
  })
  it('returns seven UTC stats rows with zero-fill', async () => {
    const made = await create({ destinationUrl: 'https://example.com', slug: 'stats', clickCap: 5 }); await request(app).get('/r/stats')
    const stats = await request(app).get(`/api/links/${made.body.id}/stats`); expect(stats.body).toHaveLength(7); expect(stats.body.reduce((sum: number, row: any) => sum + row.clicks, 0)).toBe(1); expect(stats.body.every((row: any) => typeof row.date === 'string')).toBe(true)
  })
  it('allows exactly one concurrent final click', async () => {
    await create({ destinationUrl: 'https://example.com/final', slug: 'final', clickCap: 1 })
    const responses = await Promise.all(Array.from({ length: 10 }, () => request(app).get('/r/final')))
    expect(responses.filter(r => r.status === 302)).toHaveLength(1); expect(responses.filter(r => r.status === 410)).toHaveLength(9)
    const link = await Link.findOne({ slug: 'final' }); expect(link?.clickCount).toBe(1); expect(await Click.countDocuments({ linkId: link?._id })).toBe(1)
  })
})
