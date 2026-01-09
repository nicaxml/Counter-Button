require('dotenv').config()
const express = require('express')
const http = require('http')
const path = require('path')
const cors = require('cors')
const session = require('express-session')
const bcrypt = require('bcrypt')
const { Server } = require('socket.io')
const mqtt = require('mqtt')

const { router: produksiRouter, attachStore: attachProduksiStore } = require('./routes/produksi')
const { router: dashboardRouter, attachStore: attachDashboardStore } = require('./routes/dashboard')
const { router: adminRouter, attachStore: attachAdminStore } = require('./routes/admin')
const { router: iotRouter, attachStore: attachIoTStore } = require('./routes/iot')
const { setupCron } = require('./jobs/cron')
const { createStore } = require('./services/dataStore')
const { createStore: createStoreMemory } = require('./services/dataStore.memory')
const { initDb } = require('./services/db')

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Session setup
app.use(session({
  secret: 'supersecretkey_dashlg_2025', // In production, use env var
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}))

const { requireAuth, requireApiAuth, requireSuperAdmin } = require('./middleware/auth')

// Intercept admin.html request
app.use(requireAuth)


app.use(express.static(path.join(__dirname, '..', 'public')))

// Auth Routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  
  try {
    const store = req.app.locals.store
    if (!store) {
      return res.status(503).json({ error: 'Service unavailable' })
    }

    const user = await store.getUser(username)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (match) {
      req.session.user = { id: user.id, username: user.username, role: user.role, line_id: user.line_id || null }
      req.session.isAdmin = (user.role === 'admin' || user.role === 'superadmin' || user.role === 'manager')
      req.session.isSuperAdmin = (user.role === 'superadmin')
      return res.json({ ok: true, role: user.role, line_id: user.line_id || null })
    }
    
    res.status(401).json({ error: 'Invalid credentials' })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true })
  })
})

app.get('/api/me', async (req, res) => {
  if (req.session && req.session.user) {
    try {
      const store = req.app.locals.store
      if (store) {
        const fresh = await store.getUser(req.session.user.username)
        if (fresh) {
          req.session.user = { 
            id: fresh.id, 
            username: fresh.username, 
            role: fresh.role, 
            line_id: fresh.line_id || null 
          }
          req.session.isAdmin = (fresh.role === 'admin' || fresh.role === 'superadmin' || fresh.role === 'manager')
          req.session.isSuperAdmin = (fresh.role === 'superadmin')
        }
      }
    } catch (e) {
      console.error('Session refresh error:', e)
    }
    return res.json({ user: req.session.user })
  }
  res.json({ user: null })
})

app.get('/api/health/db', async (req, res) => {
  try {
    const store = req.app.locals.store
    if (!store) return res.status(503).json({ ok: false, db_name: process.env.DB_NAME || null, error: 'no store' })
    await store.listLines()
    res.json({ ok: true, db_name: process.env.DB_NAME || null })
  } catch (e) {
    res.status(500).json({ ok: false, db_name: process.env.DB_NAME || null, error: e.message })
  }
})

;(async () => {
  try {
    let store
    const dbName = String(process.env.DB_NAME || '').trim()
    if (dbName.toLowerCase() !== 'dashlg_db') {
      console.error('Invalid DB_NAME, expected dashlg_db')
      process.exit(1)
    }
    const useMem = false
 if (!useMem) {
      // Force Database - No Fallback
      console.log('Attempting to connect to database...')
      await initDb()
      store = await createStore(io)
      await store.listLines() // Test connection
      console.log('Database store initialized successfully')
    }
    
    if (!store) {
      if (!useMem) {
         console.error('CRITICAL: Failed to initialize database store and fallback is disabled.')
         process.exit(1)
      }
      console.log('Using Memory Store')
      store = await createStoreMemory()
    } else {
      console.log('Using Database Store')
    }
    app.locals.store = store
    app.locals.io = io

    try {
      const lines = await store.listLines()
      if (Array.isArray(lines) && lines.length === 0) {
        const l1 = await store.createLine({ nama_line: 'Line 1' })
        const l2 = await store.createLine({ nama_line: 'Line 2' })
        const s1 = await store.createStyle({ orc: 'ORC-001', po: 'PO-001', style: 'Style A', color: 'Black', quantity: 1000, shipmentdate: '2025-01-15', deskripsi_orderan: 'Contoh order' })
        await store.createProses({ style_id: s1.id, urutan: 1, nama_proses: 'Cutting' })
        await store.createProses({ style_id: s1.id, urutan: 2, nama_proses: 'Sewing' })
        await store.createProses({ style_id: s1.id, urutan: 3, nama_proses: 'Finishing' })
        const tx1 = await store.createDevice({ nama: 'TX-1', tipe: 'transmitter', status: 'aktif' })
        const tx2 = await store.createDevice({ nama: 'TX-2', tipe: 'transmitter', status: 'aktif' })
        const tx3 = await store.createDevice({ nama: 'TX-3', tipe: 'transmitter', status: 'aktif' })
        const ord = await store.createOrder({ orc: 'ORC-001', line_id: l1.id, style_id: s1.id, mesin_id: null, proses_id: 1 })
        const order1 = ord.order || ord
        await store.createCounter({ order_id: order1.id, transmitter_id: tx1.id })
        await store.createCounter({ order_id: order1.id, transmitter_id: tx2.id })
        await store.createCounter({ order_id: order1.id, transmitter_id: tx3.id })
      }
      const rxs = await store.listReceivers()
      if (Array.isArray(rxs) && rxs.length === 0) {
        await store.createReceiver({ nama_rx: 'RX-01' })
        await store.createReceiver({ nama_rx: 'RX-02' })
        await store.createReceiver({ nama_rx: 'RX-03' })
      }
    } catch {}

    attachProduksiStore(store, io)
    attachDashboardStore(store)
    attachAdminStore(store)
    attachIoTStore(store)

    app.use('/api/produksi', produksiRouter)
    app.use('/api/dashboard', dashboardRouter)
    
    // Explicitly add lines route here to fix 404 issue
    app.get('/api/iot/lines', async (req, res) => {
      try {
        const lines = await store.listLines()
        res.json(lines)
      } catch (e) {
        res.status(500).json({ error: e.message })
      }
    })

    app.use('/api/iot', iotRouter)
    // Protect admin API
    app.use('/api/admin', requireApiAuth, adminRouter)
    // Compatibility aliases for devices using plain endpoints
    app.use('/', iotRouter)

    setupCron(store, io)

    function normalizeTxName(name) {
      if (!name) return null
      const s = String(name)
      // Accept formats like "TX1", "TX-01", "TX-001"
      const m = s.match(/TX[-_ ]?0*(\d+)/i)
      if (m) return `TX-${String(m[1]).padStart(2, '0')}`
      return s
    }
    function setupMqttBridge() {
      try {
        const url = process.env.MQTT_URL || 'mqtt://broker.emqx.io:1883'
        const opts = {}
        if (process.env.MQTT_USER) opts.username = process.env.MQTT_USER
        if (process.env.MQTT_PASS) opts.password = process.env.MQTT_PASS
        const client = mqtt.connect(url, opts)
        client.on('connect', () => {
          client.subscribe('iot/cmd/#', (err) => {
            if (err) console.error('MQTT subscribe error:', err)
          })
        })
        client.on('message', async (topic, payloadBuf) => {
          const ns = io.of('/dashboard')
          try {
            const raw = payloadBuf.toString()
            let payload
            try { payload = JSON.parse(raw) } catch { payload = { raw } }
            const cmdRaw = (payload.cmd || payload.event || '').toString().toLowerCase()
            const map = { accept: 'output', output: 'output', reject: 'reject', repair: 'repair' }
            const event = map[cmdRaw]
            const txNameRaw = payload.tx || payload.transmitter || payload.transmitter_id
            const txName = normalizeTxName(txNameRaw)
            if (!event || !txName) return
            
            let transmitter_id
            const dev = await store.getDeviceByName(txName)
            if (!dev) {
              const created = await store.createDevice({ nama: txName, tipe: 'transmitter', status: 'aktif' })
              transmitter_id = created.id
            } else {
              transmitter_id = dev.id
            }
            
            await store.logProductionData(transmitter_id, event, 1, { raw_cmd: cmdRaw })
          } catch (e) {
            console.error('MQTT msg error:', e)
          }
        })
      } catch (e) {
        console.error('MQTT setup error:', e)
      }
    }
    setupMqttBridge()

    const PORT = process.env.PORT || 3000
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('Startup error:', err)
  }
})()
