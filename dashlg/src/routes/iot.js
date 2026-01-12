const express = require('express')
const router = express.Router()

router.use((req, res, next) => {
  console.log('IoT Router Hit:', req.method, req.url)
  next()
})

let storeRef

function attachStore(store) {
  storeRef = store
}

function normalizeTxCode(raw) {
  if (!raw) return ''
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = s.match(/^TX0*(\d+)$/)
  if (m) {
    const num = m[1]
    return 'TX' + String(num).padStart(2, '0')
  }
  // Try pattern with dash e.g., TX-01
  const m2 = s.match(/^TX-?0*(\d+)$/)
  if (m2) {
    const num = m2[1]
    return 'TX' + String(num).padStart(2, '0')
  }
  return s.replace(/^TX-/, 'TX')
}
function codeToName(code) {
  const m = String(code).match(/^TX(\d+)$/)
  if (m) return `TX-${String(m[1]).padStart(2, '0')}`
  return code
}
// GET /get_rx?tx_id=TXxx
router.get('/get_rx', async (req, res) => {
  let { tx_id } = req.query
  if (!tx_id) return res.status(400).json({ error: 'tx_id is required' })
  tx_id = normalizeTxCode(tx_id)
  let tx = await storeRef.getTxByCode(tx_id)
  if (!tx) tx = await storeRef.getDeviceByName(codeToName(tx_id))
  if (!tx) {
    const created = await storeRef.createDevice({ nama: codeToName(tx_id), tipe: 'transmitter', status: 'aktif', tx_code: tx_id })
    return res.json({ rx: null, message: 'No RX assigned', created: created.id })
  }
  if (!tx.rx_id) return res.json({ rx: null, message: 'No RX assigned' })
  const rx = await storeRef.getRxById(tx.rx_id)
  res.json({ rx: String(rx.nama_rx || rx.nama || '').toUpperCase() })
})

// POST /update_rx
// Body: { tx_id: 'TX01', rx_id: 2 }
router.post('/update_rx', async (req, res) => {
  const { tx_id, rx_id } = req.body
  if (!tx_id || !rx_id) return res.status(400).json({ error: 'tx_id and rx_id are required' })

  const tx = await storeRef.getTxByCode(tx_id)
  if (!tx) return res.status(404).json({ error: 'TX not found' })

  // Check RX existence
  const rx = await storeRef.getRxById(rx_id)
  if (!rx) return res.status(404).json({ error: 'RX not found' })

  await storeRef.updateTxRx(tx.id, rx_id)
  res.json({ success: true, message: `TX ${tx_id} moved to RX ${rx.nama_rx}` })
})

// POST /data
// Body: { tx_id: 'TX01', type: 'accept', count: 1 }
router.post('/data', async (req, res) => {
  let { tx_id, tx, type, count } = req.body
  tx_id = tx_id || tx
  if (!tx_id || !type) return res.status(400).json({ error: 'tx_id/tx and type are required' })

  tx_id = normalizeTxCode(tx_id)
  type = String(type).toLowerCase()
  if (type === 'output') type = 'output_garment'
  if (type === 'accept') type = 'accept'
  if (type === 'reject') type = 'reject'
  if (type === 'repair') type = 'repair'

  let devTx = await storeRef.getTxByCode(tx_id)
  if (!devTx) {
    devTx = await storeRef.getDeviceByName(codeToName(tx_id))
  }
  if (!devTx) {
    // Auto create device for incoming data
    try {
      devTx = await storeRef.createDevice({ nama: codeToName(tx_id), tipe: 'transmitter', status: 'aktif', tx_code: tx_id })
    } catch {}
  }
  if (!devTx) return res.status(404).json({ error: 'TX not found' })

  await storeRef.logProductionData(devTx.id, type, count || 1)
  res.json({ success: true })
})

// POST /cmd
// Body: { tx: 'TX-01', cmd: 'ACCEPT', count?: 1 }
router.post('/cmd', async (req, res) => {
  let { tx, cmd, count } = req.body
  if (!tx || !cmd) return res.status(400).json({ error: 'tx and cmd are required' })
  const txCode = normalizeTxCode(tx)
  const c = String(cmd).toLowerCase()
  let type = c
  if (c === 'output') type = 'output_garment'
  if (!['accept', 'reject', 'repair', 'output_garment'].includes(type)) return res.status(400).json({ error: 'invalid cmd' })
  let dev = await storeRef.getTxByCode(txCode)
  if (!dev) {
    dev = await storeRef.getDeviceByName(codeToName(txCode))
  }
  if (!dev) {
    try {
      dev = await storeRef.createDevice({ nama: codeToName(txCode), tipe: 'transmitter', status: 'aktif', tx_code: txCode })
    } catch {}
  }
  if (!dev) return res.status(404).json({ error: 'TX not found' })
  await storeRef.logProductionData(dev.id, type, count || 1, { raw_cmd: cmd })
  res.json({ success: true })
})

// GET /stats
router.get('/stats', async (req, res) => {
  const line_id = req.query.line_id ? parseInt(req.query.line_id, 10) : null
  const style_id = req.query.style_id ? parseInt(req.query.style_id, 10) : null
  const stats = await storeRef.getIoTStats({ line_id, style_id })
  // console.log('IoT Stats Request:', { line_id, style_id }, stats);
  res.json(stats)
})

router.get('/styles_by_line', async (req, res) => {
  const line_id = req.query.line_id ? parseInt(req.query.line_id, 10) : null
  if (!line_id) return res.status(400).json({ error: 'line_id required' })
  const rows = await storeRef.listActiveStylesByLine(line_id)
  res.json(rows)
})

// GET /receivers
router.get('/receivers', async (req, res) => {
  const list = await storeRef.listReceivers()
  res.json(list)
})

router.get('/lines', async (req, res) => {
  const lines = await storeRef.listLines()
  res.json(lines)
})

module.exports = { router, attachStore }
