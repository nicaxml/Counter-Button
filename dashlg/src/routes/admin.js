const express = require('express')
const router = express.Router()
const { requireSuperAdmin } = require('../middleware/auth')

let storeRef

function attachStore(store) {
  storeRef = store
}

router.get('/mesin', async (req, res) => {
  res.json(await storeRef.listMesin())
})
router.post('/mesin', requireSuperAdmin, async (req, res) => {
  const { no_seri, kategori, jenis, merk } = req.body
  if (!no_seri) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createMesin({ no_seri, kategori, jenis, merk })
  res.json(row)
})
router.put('/mesin/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const row = await storeRef.updateMesin(id, req.body)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.delete('/mesin/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteMesin(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

router.get('/lines', async (req, res) => {
  res.json(await storeRef.listLines())
})
router.post('/lines', requireSuperAdmin, async (req, res) => {
  const { nama_line } = req.body
  if (!nama_line) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createLine({ nama_line })
  res.json(row)
})
router.put('/lines/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const row = await storeRef.updateLine(id, req.body)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.delete('/lines/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteLine(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

router.get('/styles', async (req, res) => {
  const lineId = req.query.line_id ? parseInt(req.query.line_id, 10) : null
  if (lineId) {
    res.json(await storeRef.listStylesByLine(lineId))
  } else {
    res.json(await storeRef.listStyles())
  }
})
router.post('/styles', requireSuperAdmin, async (req, res) => {
  const { orc, po, style, color, quantity, shipmentdate, deskripsi_orderan } = req.body
  if (!orc || !style) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createStyle({ orc, po, style, color, quantity, shipmentdate, deskripsi_orderan })
  res.json(row)
})
router.put('/styles/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const row = await storeRef.updateStyle(id, req.body)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.delete('/styles/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteStyle(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

router.get('/proses', async (req, res) => {
  const styleId = req.query.style_id ? parseInt(req.query.style_id, 10) : null
  res.json(await storeRef.listProses(styleId))
})
router.post('/proses', requireSuperAdmin, async (req, res) => {
  const { style_id, urutan, nama_proses, independent, next_proses_id } = req.body
  if (!style_id || !urutan || !nama_proses) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createProses({ style_id, urutan, nama_proses, independent: independent == null ? 1 : independent, next_proses_id: next_proses_id || null })
  res.json(row)
})
router.put('/proses/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { urutan, nama_proses, independent, next_proses_id } = req.body
  if (!urutan || !nama_proses) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.updateProses(id, { urutan, nama_proses, independent: independent == null ? 1 : independent, next_proses_id: next_proses_id || null })
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.delete('/proses/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteProses(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

// Mesin-per-Proses mapping endpoints
router.get('/proses-mesin', async (req, res) => {
  const styleId = req.query.style_id ? parseInt(req.query.style_id, 10) : null
  if (!styleId) return res.status(400).json({ error: 'invalid_style' })
  const rows = await storeRef.listProsesMesin(styleId)
  res.json(rows)
})
router.put('/proses-mesin', requireSuperAdmin, async (req, res) => {
  const { style_id, assignments } = req.body
  const sid = parseInt(style_id, 10)
  if (!sid || !Array.isArray(assignments)) return res.status(400).json({ error: 'invalid' })
  await storeRef.setBulkProsesMesin(sid, assignments)
  res.json({ ok: true })
})

router.get('/orders', async (req, res) => {
  res.json(await storeRef.listOrders())
})
router.post('/orders', requireSuperAdmin, async (req, res) => {
  const { orc, line_id, style_id, mesin_id, proses_id, transmitter_id, urutan } = req.body
  if (!orc || !line_id || !style_id || !mesin_id || !proses_id) return res.status(400).json({ error: 'invalid' })
  const result = await storeRef.createOrder({ orc, line_id, style_id, mesin_id, proses_id, transmitter_id, urutan: urutan ? parseInt(urutan) : 0 })
  res.json(result)
})
router.put('/orders/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const payload = req.body
  if (!payload.orc) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.updateOrder(id, payload)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.delete('/orders/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteOrder(id)
  if (!ok) return res.status(422).json({ error: 'cannot_delete_assigned' })
  res.json({ ok: true })
})

router.get('/devices', requireSuperAdmin, async (req, res) => {
  res.json(await storeRef.listDevices())
})
router.post('/devices', requireSuperAdmin, async (req, res) => {
  const { nama, tipe, status } = req.body
  if (!nama || !tipe) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createDevice({ nama, tipe, status })
  res.json(row)
})
router.put('/devices/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const payload = {}
  if (req.body.nama !== undefined) payload.nama = req.body.nama
  if (req.body.tx_code !== undefined) payload.tx_code = req.body.tx_code
  if (req.body.rx_id !== undefined) payload.rx_id = req.body.rx_id ? parseInt(req.body.rx_id, 10) : null
  if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.updateDevice(id, payload)
  res.json(row)
})
router.delete('/devices/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteDevice(id)
  if (!ok) return res.status(422).json({ error: 'cannot_delete_assigned' })
  res.json({ ok: true })
})
router.post('/devices/:id/delete', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteDevice(id)
  if (!ok) return res.status(422).json({ error: 'cannot_delete_assigned' })
  res.json({ ok: true })
})
router.patch('/devices/:id/status', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { status } = req.body
  const row = await storeRef.updateDeviceStatus(id, status)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.post('/devices/:id/reset-counter', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  await storeRef.resetCounterByTransmitter(id)
  res.json({ ok: true })
})

router.get('/counters', requireSuperAdmin, async (req, res) => {
  res.json(await storeRef.listCounters())
})
router.post('/counters', requireSuperAdmin, async (req, res) => {
  const { order_id, transmitter_id } = req.body
  if (!order_id || !transmitter_id) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createCounter({ order_id, transmitter_id })
  if (!row) return res.status(422).json({ error: 'cannot_assign' })
  res.json(row)
})
router.delete('/counters/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteCounter(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})
router.post('/counters/:id/delete', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteCounter(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})


router.get('/production-summary', async (req, res) => {
  const { start_date, end_date, line_id, style_id } = req.query
  const data = await storeRef.getProductionSummary({ start_date, end_date, line_id, style_id })
  res.json(data)
})

router.get('/users', requireSuperAdmin, async (req, res) => {
  const rows = await storeRef.listUsers()
  res.json(rows)
})
router.post('/users', requireSuperAdmin, async (req, res) => {
  try {
    const payload = {}
    if (req.body.username) payload.username = req.body.username
    if (req.body.role) payload.role = req.body.role === 'users' ? 'user' : req.body.role
    if (req.body.line_id !== undefined) payload.line_id = req.body.line_id ? parseInt(req.body.line_id, 10) : null
    if (req.body.password !== undefined) payload.password = req.body.password
    if (!payload.username) return res.status(400).json({ error: 'invalid' })
    const row = await storeRef.createUser(payload)
    res.json(row)
  } catch (e) {
    const msg = String(e && e.message || '')
    if (msg.includes('Duplicate') || msg.includes('ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'duplicate_username' })
    }
    res.status(500).json({ error: 'server_error' })
  }
})
router.put('/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const payload = {}
    if (req.body.username !== undefined) payload.username = req.body.username
    if (req.body.role !== undefined) payload.role = req.body.role === 'users' ? 'user' : req.body.role
    if (req.body.line_id !== undefined) payload.line_id = req.body.line_id ? parseInt(req.body.line_id, 10) : null
    if (req.body.password !== undefined) payload.password = req.body.password
    const row = await storeRef.updateUser(id, payload)
    res.json(row)
  } catch (e) {
    const msg = String(e && e.message || '')
    if (msg.includes('Duplicate') || msg.includes('ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'duplicate_username' })
    }
    res.status(500).json({ error: 'server_error' })
  }
})
router.delete('/users/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteUser(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

router.get('/colors', async (req, res) => {
  res.json(await storeRef.listColors())
})
router.post('/colors', requireSuperAdmin, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'invalid' })
  const row = await storeRef.createColor({ name })
  res.json(row)
})
router.put('/colors/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const row = await storeRef.updateColor(id, req.body)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(row)
})
router.delete('/colors/:id', requireSuperAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const ok = await storeRef.deleteColor(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

router.post('/seed', requireSuperAdmin, async (req, res) => {
  try {
    const result = { lines: [], mesin: [], styles: [], proses: [], devices: [], orders: [], counters: [] }
    const lines = await storeRef.listLines()
    if (lines.length === 0) {
      const l1 = await storeRef.createLine({ nama_line: 'Line A' })
      const l2 = await storeRef.createLine({ nama_line: 'Line B' })
      result.lines.push(l1, l2)
    }
    const mesin = await storeRef.listMesin()
    if (mesin.length === 0) {
      const m1 = await storeRef.createMesin({ nama: 'JUKI DDL-8700', kategori: 'Sewing', jenis: 'DL', merk: 'JUKI' })
      const m2 = await storeRef.createMesin({ nama: 'BROTHER S-7200C', kategori: 'Sewing', jenis: 'DL', merk: 'BROTHER' })
      result.mesin.push(m1, m2)
    }
    const styles = await storeRef.listStyles()
    if (styles.length === 0) {
      const s1 = await storeRef.createStyle({ orc: 'ORC-001', po: 'PO-001', style: 'STY-Alpha', color: 'Black', quantity: 1000, shipmentdate: '2025-01-15', deskripsi_orderan: 'Kaos lengan pendek' })
      const s2 = await storeRef.createStyle({ orc: 'ORC-002', po: 'PO-002', style: 'STY-Beta', color: 'Blue', quantity: 800, shipmentdate: '2025-01-20', deskripsi_orderan: 'Kemeja' })
      result.styles.push(s1, s2)
      const p1 = await storeRef.createProses({ style_id: s1.id, urutan: 1, nama_proses: 'Cutting' })
      const p2 = await storeRef.createProses({ style_id: s1.id, urutan: 2, nama_proses: 'Sewing' })
      const p3 = await storeRef.createProses({ style_id: s1.id, urutan: 3, nama_proses: 'QC' })
      const p4 = await storeRef.createProses({ style_id: s1.id, urutan: 4, nama_proses: 'Packing' })
      const p5 = await storeRef.createProses({ style_id: s2.id, urutan: 1, nama_proses: 'Cutting' })
      const p6 = await storeRef.createProses({ style_id: s2.id, urutan: 2, nama_proses: 'Sewing' })
      const p7 = await storeRef.createProses({ style_id: s2.id, urutan: 3, nama_proses: 'QC' })
      const p8 = await storeRef.createProses({ style_id: s2.id, urutan: 4, nama_proses: 'Packing' })
      result.proses.push(p1, p2, p3, p4, p5, p6, p7, p8)
    }
    const devices = await storeRef.listDevices()
    if (devices.length === 0) {
      const d1 = await storeRef.createDevice({ nama: 'TX-01', tipe: 'transmitter', status: 'aktif' })
      const d2 = await storeRef.createDevice({ nama: 'TX-02', tipe: 'transmitter', status: 'aktif' })
      const d3 = await storeRef.createDevice({ nama: 'TX-03', tipe: 'transmitter', status: 'aktif' })
      const r1 = await storeRef.createDevice({ nama: 'RX-01', tipe: 'receiver', status: 'aktif' })
      result.devices.push(d1, d2, d3, r1)
    }
    const currentLines = result.lines.length ? result.lines : await storeRef.listLines()
    const currentMesin = result.mesin.length ? result.mesin : await storeRef.listMesin()
    const currentStyles = result.styles.length ? result.styles : await storeRef.listStyles()
    const orders = await storeRef.listOrders()
    if (orders.length === 0 && currentLines.length > 0 && currentMesin.length > 0 && currentStyles.length > 0) {
      const o1 = await storeRef.createOrder({ orc: currentStyles[0].orc, line_id: currentLines[0].id, style_id: currentStyles[0].id, mesin_id: currentMesin[0].id })
      const o2 = await storeRef.createOrder({ orc: currentStyles[1].orc, line_id: currentLines[1].id, style_id: currentStyles[1].id, mesin_id: currentMesin[1].id })
      result.orders.push(o1, o2)
    }
    const txs = (result.devices.length ? result.devices : await storeRef.listDevices()).filter(d => d.tipe === 'transmitter')
    const currOrders = result.orders.length ? result.orders.map(x => x.order || x) : await storeRef.listOrders()
    const counters = await storeRef.listCounters()
    if (counters.length === 0 && txs.length > 0 && currOrders.length > 0) {
      const c1 = await storeRef.createCounter({ order_id: currOrders[0].id, transmitter_id: txs[0].id })
      const c2 = await storeRef.createCounter({ order_id: currOrders[1].id, transmitter_id: txs[1].id })
      if (c1) result.counters.push(c1)
      if (c2) result.counters.push(c2)
    }
    res.json(result)
  } catch (e) {
    console.error('Seed error', e)
    res.status(500).json({ error: 'seed_failed', message: String(e && e.message ? e.message : e) })
  }
})

module.exports = { router, attachStore }
