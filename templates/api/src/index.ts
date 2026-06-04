import { createApp, BlazeError } from 'blazefw'
import { cors }      from 'blazefw/middleware/cors'
import { logger }    from 'blazefw/middleware/logger'
import { requestId } from 'blazefw/middleware/request-id'
import { items }     from './routes/items'
import { health }    from './routes/health'
import type { Env }  from './types/env'

const app = createApp<Env>()

app.use(requestId())
app.use(logger())
app.use(cors({ origins: '*' }))

app.use('/items',  items)
app.use('/health', health)

app.get('/', (req, res) => {
  res.json({ name: '<PROJECT_NAME>', version: '0.1.0' })
})

app.onError((err, req, res, next) => {
  if (err instanceof BlazeError) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
})

export default { fetch: app.fetch }
