const express = require('express')
const router = express.Router()

let storeRef
let ioRef

function attachStore(store, io) {
  storeRef = store
  ioRef = io
}

router.post('/input', async (req, res) => {
  const { timestamp, line_id, style_id, transmitter_id, event, proses_aktif_urutan } = req.body
  if (!line_id || !style_id || !transmitter_id || !event) return res.status(400).json({ error: 'invalid' })
  const date = storeRef.todayStr()
  if (event === 'output') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { output: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { output: 1 })
  } else if (event === 'reject') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { reject: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { reject: 1 })
  } else if (event === 'repair') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { repair: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { repair: 1 })
  } else {
    return res.status(400).json({ error: 'invalid_event' })
  }
  await storeRef.addLog({ aksi: 'produksi_input', transmitter_id, line_id, style_id, user: req.headers['x-user'] || 'system', metadata: { timestamp, event, proses_aktif_urutan } })
  const ns = ioRef.of('/dashboard')
  const har = await storeRef.summary('harian', line_id, style_id)
  const harFinal = await storeRef.summaryFinalHarian(line_id, style_id)
  ns.to('dashboard').emit('dashboard:update', { scope: 'harian', ...har, summary: harFinal.summary, line_id, style_id })
  const ak = await storeRef.summary('akumulasi', line_id, style_id)
  ns.to('dashboard').emit('dashboard:update', { scope: 'akumulasi', ...ak, line_id, style_id })
  return res.json({ ok: true })
})

router.post('/input/tx', async (req, res) => {
  const { timestamp, transmitter_id, event, proses_aktif_urutan } = req.body
  if (!transmitter_id || !event) return res.status(400).json({ error: 'invalid' })
  const order = await storeRef.getActiveOrderByTransmitter(transmitter_id)
  if (!order) return res.status(422).json({ error: 'not_assigned' })
  const line_id = order.line_id
  const style_id = order.style_id
  const date = storeRef.todayStr()
  if (event === 'output') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { output: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { output: 1 })
  } else if (event === 'reject') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { reject: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { reject: 1 })
  } else if (event === 'repair') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { repair: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { repair: 1 })
  } else {
    return res.status(400).json({ error: 'invalid_event' })
  }
  await storeRef.addLog({ aksi: 'produksi_input', transmitter_id, line_id, style_id, user: req.headers['x-user'] || 'system', metadata: { timestamp, event, proses_aktif_urutan } })
  const ns = ioRef.of('/dashboard')
  const har = await storeRef.summary('harian', line_id, style_id)
  const harFinal = await storeRef.summaryFinalHarian(line_id, style_id)
  ns.to('dashboard').emit('dashboard:update', { scope: 'harian', ...har, summary: harFinal.summary, line_id, style_id })
  const ak = await storeRef.summary('akumulasi', line_id, style_id)
  ns.to('dashboard').emit('dashboard:update', { scope: 'akumulasi', ...ak, line_id, style_id })
  return res.json({ ok: true })
})

router.post('/input/rx', async (req, res) => {
  const { timestamp, rx, tx, cmd, event, type, proses_aktif_urutan } = req.body
  const eRaw = (event || cmd || type || '').toString().toLowerCase()
  const map = { accept: 'output', output: 'output', reject: 'reject', repair: 'repair' }
  const ev = map[eRaw]
  if (!tx || !ev) return res.status(400).json({ error: 'invalid' })
  function txNameCandidates(name) {
    const s = String(name)
    const m = s.match(/TX[-_ ]?0*(\d+)/i)
    if (m) {
      const num = String(m[1])
      const three = `TX-${num.padStart(3, '0')}`
      const two = `TX-${num.padStart(2, '0')}`
      return [three, two, s]
    }
    return [s]
  }
  const candidates = txNameCandidates(tx)
  let txDev = null
  for (const cand of candidates) {
    txDev = await storeRef.getDeviceByName(cand)
    if (txDev) break
  }
  const txName = txDev ? txDev.nama : candidates[0]
  if (!txDev) {
    txDev = await storeRef.createDevice({ nama: txName, tipe: 'transmitter', status: 'aktif' })
    await storeRef.addLog({ aksi: 'device_auto_create', transmitter_id: txDev.id, user: 'system', metadata: { nama: txName, tipe: 'transmitter', source: 'http_rx' } })
  }
  if (rx) {
    const rxDev = await storeRef.getDeviceByName(String(rx))
    if (!rxDev) {
      const createdRx = await storeRef.createDevice({ nama: String(rx), tipe: 'receiver', status: 'aktif' })
      await storeRef.addLog({ aksi: 'device_auto_create', transmitter_id: createdRx.id, user: 'system', metadata: { nama: String(rx), tipe: 'receiver', source: 'http_rx' } })
    }
  }
  const transmitter_id = txDev.id
  const order = await storeRef.getActiveOrderByTransmitter(transmitter_id)
  if (!order) return res.status(422).json({ error: 'not_assigned' })
  const line_id = order.line_id
  const style_id = order.style_id
  const date = storeRef.todayStr()
  if (ev === 'output') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { output: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { output: 1 })
  } else if (ev === 'reject') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { reject: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { reject: 1 })
  } else if (ev === 'repair') {
    await storeRef.upsertHarian(date, line_id, style_id, transmitter_id, { repair: 1 })
    await storeRef.upsertAkumulasi(line_id, style_id, transmitter_id, { repair: 1 })
  } else {
    return res.status(400).json({ error: 'invalid_event' })
  }
  await storeRef.addLog({ aksi: 'produksi_input', transmitter_id, line_id, style_id, user: 'receiver', metadata: { timestamp, rx, tx: txName, event: ev, cmd, type, proses_aktif_urutan } })
  const ns = ioRef.of('/dashboard')
  const har = await storeRef.summary('harian', line_id, style_id)
  const harFinal = await storeRef.summaryFinalHarian(line_id, style_id)
  ns.to('dashboard').emit('dashboard:update', { scope: 'harian', ...har, summary: harFinal.summary, line_id, style_id })
  const ak = await storeRef.summary('akumulasi', line_id, style_id)
  ns.to('dashboard').emit('dashboard:update', { scope: 'akumulasi', ...ak, line_id, style_id })
  return res.json({ ok: true })
})
module.exports = { router, attachStore }
