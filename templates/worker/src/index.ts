import { createApp } from 'blazefw'

type Env = {
  // Add your Cloudflare bindings here
  // KV: KVNamespace
  // DB: D1Database
}

const app = createApp<Env>()

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Blaze 🔥', timestamp: Date.now() })
})

export default { fetch: app.fetch }
