import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { z } from 'zod'
import crypto from 'node:crypto'

const app = express()
app.use(cors({ origin: process.env.CLIENT_URL || true }))
app.use(express.json())

const LinkSchema = new mongoose.Schema({
  slug: { type: String, unique: true, index: true, required: true },
  destinationUrl: { type: String, required: true },
  clickCap: { type: Number, default: null },
  clickCount: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
}, { timestamps: true })
const ClickSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  clickedAt: { type: Date, default: Date.now },
  referrer: { type: String, default: null },
})
const Link = mongoose.models.Link || mongoose.model('Link', LinkSchema)
const Click = mongoose.models.Click || mongoose.model('Click', ClickSchema)
const createSchema = z.object({
  destinationUrl: z.string().url().refine(v => /^https?:\/\//i.test(v), 'Only HTTP(S) URLs are supported'),
  slug: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  clickCap: z.number().int().positive().max(1000000).nullable().optional(),
})
const idSchema = z.string().regex(/^[a-f\d]{24}$/i)
const publicLink = (x: any) => {
  const value = x.toObject ? x.toObject() : x
  const status = value.disabled ? 'disabled' : value.clickCap !== null && value.clickCount >= value.clickCap ? 'capped' : 'active'
  return { ...value, id: value._id.toString(), status }
}
const error = (res: any, status: number, message: string) => res.status(status).json({ message, error: message })
const isDuplicate = (e: any) => e?.code === 11000 || e?.name === 'MongoServerError' && String(e?.message).includes('E11000')

app.get('/api/health', (_, res) => res.json({ ok: true }))
app.post('/api/links', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    const slug = body.slug || crypto.randomBytes(5).toString('base64url')
    if (body.slug && await Link.exists({ slug })) return error(res, 409, 'This slug is already in use.')
    const link = await Link.create({ ...body, slug })
    res.status(201).json(publicLink(link))
  } catch (e) { if (isDuplicate(e)) return error(res, 409, 'This slug is already in use.'); next(e) }
})
app.get('/api/links', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || req.query.limit) || 10))
    const search = String(req.query.search || '').trim()
    const filter = search ? { $or: [{ slug: { $regex: search, $options: 'i' } }, { destinationUrl: { $regex: search, $options: 'i' } }] } : {}
    const [items, total] = await Promise.all([Link.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize), Link.countDocuments(filter)])
    res.json({ items: items.map(publicLink), page, pageSize, limit: pageSize, total, totalPages: Math.ceil(total / pageSize), pages: Math.ceil(total / pageSize) })
  } catch (e) { next(e) }
})
app.get('/api/links/:id', async (req, res, next) => {
  try { if (!idSchema.safeParse(req.params.id).success) return error(res, 400, 'Invalid link id'); const link = await Link.findById(req.params.id); if (!link) return error(res, 404, 'Link not found'); res.json(publicLink(link)) } catch (e) { next(e) }
})
app.get('/api/links/:id/stats', async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) return error(res, 400, 'Invalid link id')
    const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 6)
    const rows = await Click.aggregate([{ $match: { linkId: new mongoose.Types.ObjectId(req.params.id), clickedAt: { $gte: start } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$clickedAt', timezone: 'UTC' } }, clicks: { $sum: 1 } } }])
    const map = new Map(rows.map(x => [x._id, x.clicks]))
    res.json(Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); const date = d.toISOString().slice(0, 10); return { date, clicks: map.get(date) || 0 } }))
  } catch (e) { next(e) }
})
app.patch('/api/links/:id/disable', async (req, res, next) => { try { const link = await Link.findByIdAndUpdate(req.params.id, { disabled: true }, { new: true }); if (!link) return error(res, 404, 'Link not found'); res.json(publicLink(link)) } catch (e) { next(e) } })
app.delete('/api/links/:id', async (req, res, next) => {
  try {
    const link = await Link.findByIdAndDelete(req.params.id)
    if (!link) return error(res, 404, 'Link not found')
    await Click.deleteMany({ linkId: link._id })
    res.status(204).end()
  } catch (e) { next(e) }
})
app.get('/r/:slug', async (req, res, next) => {
  try {
    const link = await Link.findOneAndUpdate(
      { slug: req.params.slug, disabled: false, $expr: { $or: [{ $eq: ['$clickCap', null] }, { $gt: ['$clickCap', '$clickCount'] }] } },
      { $inc: { clickCount: 1 } },
      { returnDocument: 'after' },
    )
    if (!link) return res.status(410).send('This link is unavailable')
    await Click.create({ linkId: link._id, referrer: req.get('referer') || null })
    res.redirect(link.destinationUrl)
  } catch (e) { next(e) }
})
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { if (err instanceof z.ZodError) return error(res, 400, err.issues[0]?.message || 'Invalid request'); console.error(err); error(res, err.status || 500, err.status ? err.message : 'Internal server error') })
export { app, Link, Click }
if (process.env.NODE_ENV !== 'test') mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shortlink-studio').then(() => app.listen(Number(process.env.PORT) || 4000))
