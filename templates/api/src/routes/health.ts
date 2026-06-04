import { Router } from 'blazefw'

const router = new Router()

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    colo:    req.cf?.colo,
    country: req.cf?.country,
    ts:      Date.now(),
  })
})

export { router as health }
