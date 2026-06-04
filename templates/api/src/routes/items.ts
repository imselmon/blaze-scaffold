import { BlazeError, Router } from 'blazefw'
import type { Env } from '../types/env'

const router = new Router<Env>()

// GET /items
router.get('/', async (req, res) => {
  const { results } = await req.env.DB
    .prepare('SELECT * FROM items ORDER BY created_at DESC LIMIT 50')
    .all()
  res.json({ items: results })
})

// GET /items/:id
router.get('/:id', async (req, res) => {
  const item = await req.env.DB
    .prepare('SELECT * FROM items WHERE id = ?')
    .bind(req.params.id)
    .first()
  if (!item) throw new BlazeError(404, 'Item not found')
  res.json(item)
})

// POST /items
router.post('/', async (req, res) => {
  const { name, description } = await req.json<{ name: string; description?: string }>()
  if (!name) throw new BlazeError(422, 'name is required')
  const result = await req.env.DB
    .prepare('INSERT INTO items (name, description) VALUES (?, ?) RETURNING id')
    .bind(name, description ?? null)
    .first<{ id: string }>()
  res.status(201).json({ id: result?.id })
})

// DELETE /items/:id
router.delete('/:id', async (req, res) => {
  const { meta } = await req.env.DB
    .prepare('DELETE FROM items WHERE id = ?')
    .bind(req.params.id)
    .run()
  if (meta.changes === 0) throw new BlazeError(404, 'Item not found')
  res.status(204).send()
})

export { router as items }
