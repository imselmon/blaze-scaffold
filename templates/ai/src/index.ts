import { createApp } from 'blazefw'
import { cors }   from 'blazefw/middleware/cors'
import { logger } from 'blazefw/middleware/logger'

type Env = { AI: Ai }

const app = createApp<Env>()
app.use(logger())
app.use(cors({ origins: '*' }))

// Non-streaming completion
app.post('/ai/complete', async (req, res) => {
  const { prompt, system } = await req.json<{ prompt: string; system?: string }>()
  const result = await req.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      { role: 'user' as const, content: prompt },
    ],
  })
  res.json(result)
})

// Streaming completion — Server-Sent Events
app.post('/ai/stream', async (req, res) => {
  const { prompt } = await req.json<{ prompt: string }>()
  const stream = await req.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  })
  res.header('Content-Type', 'text/event-stream')
  res.header('Cache-Control', 'no-cache')
  res.stream((writer) => (stream as ReadableStream).pipeTo(writer))
})

export default { fetch: app.fetch }
