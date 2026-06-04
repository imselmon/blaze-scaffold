import { createApp } from 'blazefw'
import { cors }   from 'blazefw/middleware/cors'
import { logger } from 'blazefw/middleware/logger'

type Env = { KV: KVNamespace }
const app = createApp<Env>()

app.use(logger())
app.use(cors({ origins: '*' }))

app.get('/api', (req, res) => {
  res.json({ message: 'API is running 🔥' })
})

app.get('/api/kv/:key', async (req, res) => {
  const value = await req.env.KV.get(req.params.key)
  if (value === null) return res.status(404).json({ error: 'Key not found' })
  res.json({ key: req.params.key, value })
})

export default { fetch: app.fetch }
