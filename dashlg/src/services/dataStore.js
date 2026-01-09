const { pool } = require('./db')
const bcrypt = require('bcrypt')

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function createStore(io) {
  
  let prosesMesin = []

  async function ensureProsesMesinTable() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proses_mesin (
          style_id INT,
          proses_id INT,
          mesin_id INT,
          PRIMARY KEY (style_id, proses_id, mesin_id)
        )
      `)
      const [rows] = await pool.query('SELECT * FROM proses_mesin')
      prosesMesin = rows
    } catch (e) {
      console.error('Failed to ensure proses_mesin table', e)
    }
  }
  
  // Initialize
  await ensureProsesMesinTable()
  
  async function ensureProsesDepsSchema() {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`proses\``)
      const names = cols.map(c => c.Field)
      if (!names.includes('independent')) {
        await pool.query(`ALTER TABLE \`proses\` ADD COLUMN independent TINYINT(1) NOT NULL DEFAULT 1`)
      }
      if (!names.includes('next_proses_id')) {
        await pool.query(`ALTER TABLE \`proses\` ADD COLUMN next_proses_id INT NULL`)
      }
    } catch (e) {
      console.error('Failed to ensure proses dependency schema', e)
    }
  }

  async function ensureOrdersSchema() {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`orders\``)
      const names = cols.map(c => c.Field)
      if (!names.includes('urutan')) {
        await pool.query(`ALTER TABLE \`orders\` ADD COLUMN urutan INT DEFAULT 0`)
      }
    } catch (e) {
      console.error('Failed to ensure orders schema', e)
    }
  }
  
  async function getLinesSchema() {
    const [cols] = await pool.query(`SHOW COLUMNS FROM \`lines\``)
    const names = cols.map(c => c.Field)
    const idCol = names.includes('id') ? 'id' : (names.includes('line_id') ? 'line_id' : 'id')
    const nameCol = names.includes('nama_line') ? 'nama_line' : (names.includes('line_name') ? 'line_name' : 'nama_line')
    return { idCol, nameCol }
  }
  async function getUsersColumns() {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`users\``)
      return cols.map(c => c.Field)
    } catch {
      return ['id','username','password','role']
    }
  }
  
  async function upsertHarian(date, lineId, styleId, txId, delta) {
    const output = delta.output || 0
    const reject = delta.reject || 0
    const repair = delta.repair || 0
    
    // Check if exists
    const [rows] = await pool.query(
      `SELECT * FROM harian WHERE tanggal = ? AND line_id = ? AND style_id = ? AND transmitter_id = ?`,
      [date, lineId, styleId, txId]
    )
    
    if (rows.length > 0) {
      const curr = rows[0]
      const newOutput = curr.output + output
      const newReject = curr.reject + reject
      const newRepair = curr.repair + repair
      await pool.query(
        `UPDATE harian SET output = ?, reject = ?, repair = ? WHERE id = ?`,
        [newOutput, newReject, newRepair, curr.id]
      )
      return { ...curr, output: newOutput, reject: newReject, repair: newRepair }
    } else {
      const [res] = await pool.query(
        `INSERT INTO harian (tanggal, line_id, style_id, transmitter_id, output, reject, repair) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [date, lineId, styleId, txId, output, reject, repair]
      )
      return { id: res.insertId, tanggal: date, line_id: lineId, style_id: styleId, transmitter_id: txId, output, reject, repair }
    }
  }

  async function upsertAkumulasi(lineId, styleId, txId, delta) {
    const output = delta.output || 0
    const reject = delta.reject || 0
    const repair = delta.repair || 0
    
    const [rows] = await pool.query(
      `SELECT * FROM akumulasi WHERE line_id = ? AND style_id = ? AND transmitter_id = ?`,
      [lineId, styleId, txId]
    )
    
    if (rows.length > 0) {
      const curr = rows[0]
      const newOutput = curr.total_output + output
      const newReject = curr.total_reject + reject
      const newRepair = curr.total_repair + repair
      await pool.query(
        `UPDATE akumulasi SET total_output = ?, total_reject = ?, total_repair = ? WHERE id = ?`,
        [newOutput, newReject, newRepair, curr.id]
      )
      return { ...curr, total_output: newOutput, total_reject: newReject, total_repair: newRepair }
    } else {
      const [res] = await pool.query(
        `INSERT INTO akumulasi (line_id, style_id, transmitter_id, total_output, total_reject, total_repair) VALUES (?, ?, ?, ?, ?, ?)`,
        [lineId, styleId, txId, output, reject, repair]
      )
      return { id: res.insertId, line_id: lineId, style_id: styleId, transmitter_id: txId, total_output: output, total_reject: reject, total_repair: repair }
    }
  }

  async function summary(scope, lineId, styleId) {
    // Logic: 
    // Join with counters (active) and orders (active)
    // Filter by lineId, styleId if provided
    
    let query = ''
    let params = []
    
    const { idCol: lineIdCol, nameCol: lineNameCol } = await getLinesSchema()
    if (scope === 'harian') {
      const date = todayStr()
      query = `
        SELECT 
          h.transmitter_id,
          h.output, h.reject, h.repair,
          s.id as style_id, s.style, l.${lineNameCol} AS nama_line
        FROM harian h
        JOIN counters c ON h.transmitter_id = c.transmitter_id AND c.active = 1
        JOIN orders o ON c.order_id = o.id AND o.status = 'aktif'
        JOIN styles s ON o.style_id = s.id
        JOIN \`lines\` l ON o.line_id = l.${lineIdCol}
        WHERE h.tanggal = ?
          AND o.line_id = h.line_id 
          AND o.style_id = h.style_id
      `
      params.push(date)
    } else {
      query = `
        SELECT 
          a.transmitter_id,
          a.total_output as output, a.total_reject as reject, a.total_repair as repair,
          s.id as style_id, s.style, l.${lineNameCol} AS nama_line
        FROM akumulasi a
        JOIN counters c ON a.transmitter_id = c.transmitter_id AND c.active = 1
        JOIN orders o ON c.order_id = o.id AND o.status = 'aktif'
        JOIN styles s ON o.style_id = s.id
        JOIN \`lines\` l ON o.line_id = l.${lineIdCol}
        WHERE a.line_id = o.line_id AND a.style_id = o.style_id
      `
    }
    
    if (lineId) {
      query += ` AND ${scope === 'harian' ? 'h' : 'a'}.line_id = ?`
      params.push(lineId)
    }
    if (styleId) {
      query += ` AND ${scope === 'harian' ? 'h' : 'a'}.style_id = ?`
      params.push(styleId)
    }
    
    const [rows] = await pool.query(query, params)

    // Pre-fetch process names for relevant styles
    const styleIds = [...new Set(rows.map(r => r.style_id))]
    const processMap = new Map() // style_id -> Map(proses_id -> nama_proses)
    for (const sid of styleIds) {
      const procs = await listProses(sid)
      const pMap = new Map()
      procs.forEach(p => pMap.set(p.id, p.nama_proses))
      processMap.set(sid, pMap)
    }
    
    const sum = rows.reduce((a, r) => ({ output: a.output + r.output, reject: a.reject + r.reject, repair: a.repair + r.repair }), { output: 0, reject: 0, repair: 0 })
    const byTx = rows.map(r => {
      // Resolve name from prosesMesin
      const mapping = prosesMesin.find(m => m.style_id == r.style_id && m.mesin_id == r.transmitter_id)
      let nama = `TX-${r.transmitter_id}`
      if (mapping) {
        const pName = processMap.get(r.style_id)?.get(mapping.proses_id)
        if (pName) nama = pName
      }

      return { 
        transmitter_id: r.transmitter_id, 
        nama, 
        output: r.output, 
        reject: r.reject, 
        repair: r.repair,
        style_name: r.style,
        line_name: r.nama_line
      }
    })
    
    return { summary: sum, by_transmitter: byTx }
  }

  async function calculateFinalStats(rows, lineId, styleId) {
    const perStyleOutputByUrutan = new Map()
    const perStyleRejectByUrutan = new Map()
    const perStyleRepairByUrutan = new Map()
    for (const row of rows) {
      if (lineId && row.line_id != lineId) continue
      if (styleId && row.style_id != styleId) continue
      let meta
      try { meta = JSON.parse(row.metadata || '{}') } catch { meta = {} }
      const ev = (meta.event || '').toString().toLowerCase()
      const ur = meta.proses_aktif_urutan != null ? parseInt(meta.proses_aktif_urutan, 10) : null
      if (!ev || ur == null) continue
      const sid = row.style_id
      if (!perStyleOutputByUrutan.has(sid)) perStyleOutputByUrutan.set(sid, new Map())
      if (!perStyleRejectByUrutan.has(sid)) perStyleRejectByUrutan.set(sid, new Map())
      if (!perStyleRepairByUrutan.has(sid)) perStyleRepairByUrutan.set(sid, new Map())
      if (ev === 'output') {
        const m = perStyleOutputByUrutan.get(sid)
        m.set(ur, (m.get(ur) || 0) + 1)
      } else if (ev === 'reject') {
        const m = perStyleRejectByUrutan.get(sid)
        m.set(ur, (m.get(ur) || 0) + 1)
      } else if (ev === 'repair') {
        const m = perStyleRepairByUrutan.get(sid)
        m.set(ur, (m.get(ur) || 0) + 1)
      }
    }
    let totalOutput = 0, totalReject = 0, totalRepair = 0
    const maxCache = new Map()
    for (const [sid, outMap] of perStyleOutputByUrutan.entries()) {
      let max = maxCache.get(sid)
      if (max == null) {
        max = await getMaxUrutan(sid)
        maxCache.set(sid, max)
      }
      if (!max || max <= 0) continue
      let capacity = Infinity
      for (let u = 1; u <= max; u++) {
        const count = outMap.get(u) || 0
        capacity = Math.min(capacity, count)
      }
      if (!isFinite(capacity)) capacity = 0
      const outFinalStage = outMap.get(max) || 0
      const rejFinalStage = (perStyleRejectByUrutan.get(sid)?.get(max) || 0)
      const repFinalStage = (perStyleRepairByUrutan.get(sid)?.get(max) || 0)
      const outputCount = Math.min(outFinalStage, capacity)
      const remaining = Math.max(capacity - outputCount, 0)
      const rejectCount = Math.min(rejFinalStage, remaining)
      const remaining2 = Math.max(remaining - rejectCount, 0)
      const repairCount = Math.min(repFinalStage, remaining2)
      totalOutput += outputCount
      totalReject += rejectCount
      totalRepair += repairCount
    }
    return { summary: { output: totalOutput, reject: totalReject, repair: totalRepair } }
  }

  async function summaryFinalHarian(lineId, styleId) {
    const date = todayStr()
    let query = `SELECT transmitter_id, line_id, style_id, timestamp, metadata FROM logs WHERE aksi = 'produksi_input' AND DATE(timestamp) = ?`
    const params = [date]
    if (lineId) { query += ` AND line_id = ?`; params.push(lineId) }
    if (styleId) { query += ` AND style_id = ?`; params.push(styleId) }
    
    const [rows] = await pool.query(query, params)
    return calculateFinalStats(rows, lineId, styleId)
  }

  async function summaryFinalAkumulasi(lineId, styleId) {
    let query = `SELECT transmitter_id, line_id, style_id, timestamp, metadata FROM logs WHERE aksi = 'produksi_input'`
    const params = []
    if (lineId) { query += ` AND line_id = ?`; params.push(lineId) }
    if (styleId) { query += ` AND style_id = ?`; params.push(styleId) }

    const [rows] = await pool.query(query, params)
    return calculateFinalStats(rows, lineId, styleId)
  }

  async function resetDaily() {
    try {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const prevDate = `${y}-${m}-${day}`
      
      const [txs] = await pool.query(`SELECT DISTINCT transmitter_id FROM harian WHERE tanggal = ?`, [prevDate])
      const allSummary = []
      for (const tx of txs) {
        const [detailRows] = await pool.query(
          `SELECT h.line_id, h.style_id, SUM(h.output) as output, SUM(h.reject) as reject, SUM(h.repair) as repair
           FROM harian h 
           WHERE h.tanggal = ? AND h.transmitter_id = ?
           GROUP BY h.line_id, h.style_id`,
          [prevDate, tx.transmitter_id]
        )
        const summary = detailRows.reduce((acc, r) => ({
          output: acc.output + (r.output || 0),
          reject: acc.reject + (r.reject || 0),
          repair: acc.repair + (r.repair || 0)
        }), { output: 0, reject: 0, repair: 0 })
        allSummary.push({ transmitter_id: tx.transmitter_id, summary, per_detail: detailRows })
      }
      await addLog({
        aksi: 'reset_otomatis',
        user: 'system',
        metadata: {
          tanggal: prevDate,
          total_transmitters: txs.length,
          all_summary: allSummary,
          description: 'Auto-reset harian seluruh transmitter. Ringkasan sebelum reset (hari sebelumnya).'
        }
      })
      return true
    } catch (e) {
      console.error('Failed resetDaily summary', e)
      return false
    }
  }

  async function addLog(entry) {
    try {
      await pool.query(
        `INSERT INTO logs (timestamp, aksi, transmitter_id, line_id, style_id, user, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entry.timestamp || new Date(), entry.aksi, entry.transmitter_id, entry.line_id, entry.style_id, entry.user, JSON.stringify(entry.metadata)]
      )
    } catch (e) {
      console.error('Failed to add log', e)
    }
  }



  async function getLogs(filter) {
    let query = `SELECT * FROM logs WHERE 1=1`
    const params = []
    if (filter.aksi) {
      query += ` AND aksi = ?`
      params.push(filter.aksi)
    }
    if (filter.line_id) {
      query += ` AND line_id = ?`
      params.push(filter.line_id)
    }
    if (filter.style_id) {
      query += ` AND style_id = ?`
      params.push(filter.style_id)
    }
    query += ` ORDER BY timestamp DESC LIMIT 100`
    const [rows] = await pool.query(query, params)
    return rows.map(r => ({ ...r, metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata }))
  }
  async function clearLogs() {
    await pool.query(`DELETE FROM logs`)
    return true
  }

  async function getProductionSummary(filter) {
    // Basic query to aggregate daily production
    let query = `
      SELECT 
        h.tanggal,
        l.nama_line,
        s.style,
        SUM(h.output) as total_output,
        SUM(h.reject) as total_reject,
        SUM(h.repair) as total_repair
      FROM harian h
      LEFT JOIN \`lines\` l ON h.line_id = l.${(await getLinesSchema()).idCol}
      LEFT JOIN styles s ON h.style_id = s.id
      WHERE 1=1
    `
    const params = []
    
    if (filter.start_date) {
      query += ` AND h.tanggal >= ?`
      params.push(filter.start_date)
    }
    if (filter.end_date) {
      query += ` AND h.tanggal <= ?`
      params.push(filter.end_date)
    }
    if (filter.line_id) {
      query += ` AND h.line_id = ?`
      params.push(filter.line_id)
    }
    if (filter.style_id) {
      query += ` AND h.style_id = ?`
      params.push(filter.style_id)
    }
    
    query += ` GROUP BY h.tanggal, h.line_id, h.style_id ORDER BY h.tanggal DESC`
    
    const [rows] = await pool.query(query, params)
    return rows
  }

  async function listMesin() { 
    const [rows] = await pool.query(`SELECT * FROM mesin`)
    return rows
  }
  async function createMesin(payload) {
    const [res] = await pool.query(`INSERT INTO mesin (no_seri, kategori, jenis, merk) VALUES (?, ?, ?, ?)`, [payload.no_seri, payload.kategori, payload.jenis, payload.merk])
    const row = { id: res.insertId, ...payload }
    await addLog({ aksi: 'mesin_create', user: 'admin', metadata: { row } })
    return row
  }
  async function updateMesin(id, payload) {
    await pool.query(`UPDATE mesin SET no_seri = ?, kategori = ?, jenis = ?, merk = ? WHERE id = ?`, [payload.no_seri, payload.kategori, payload.jenis, payload.merk, id])
    const row = { id, ...payload }
    await addLog({ aksi: 'mesin_update', user: 'admin', metadata: { id, payload } })
    return row
  }
  async function deleteMesin(id) {
    await pool.query(`DELETE FROM mesin WHERE id = ?`, [id])
    await addLog({ aksi: 'mesin_delete', user: 'admin', metadata: { id } })
    return true
  }

  async function getUser(username) {
    const [rows] = await pool.query(`SELECT * FROM users WHERE username = ?`, [username])
    const u = rows[0]
    if (!u) return null
    if (u.line_id === undefined) u.line_id = null
    return u
  }

  async function listUsers() {
    try {
      const [rows] = await pool.query(`
        SELECT u.id, u.username, u.role, u.line_id, l.nama_line 
        FROM users u
        LEFT JOIN \`lines\` l ON u.line_id = l.id
      `)
      return rows
    } catch (e) {
      const [rows] = await pool.query(`SELECT id, username, role FROM users`)
      return rows
    }
  }
  async function updateUser(id, payload) {
    const cols = await getUsersColumns()
    const fields = []
    const values = []
    if (payload.username !== undefined) { fields.push('username = ?'); values.push(payload.username) }
    if (payload.role !== undefined) { fields.push('role = ?'); values.push(payload.role) }
    if (payload.line_id !== undefined && cols.includes('line_id')) { fields.push('line_id = ?'); values.push(payload.line_id || null) }
    if (payload.password !== undefined && payload.password) {
      const hash = await bcrypt.hash(payload.password, 10)
      fields.push('password = ?'); values.push(hash)
    }
    if (fields.length === 0) return { id }
    values.push(id)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
    await addLog({ aksi: 'user_update', user: 'admin', metadata: { id, payload: { ...payload, password: !!payload.password } } })
    return { id, ...payload }
  }
  async function deleteUser(id) {
    await pool.query(`DELETE FROM users WHERE id = ?`, [id])
    await addLog({ aksi: 'user_delete', user: 'admin', metadata: { id } })
    return true
  }
  async function createUser(payload) {
    const username = payload.username
    const role = payload.role || 'users'
    const cols = await getUsersColumns()
    const line_id = payload.line_id || null
    const password = payload.password || 'user123'
    const hash = await bcrypt.hash(password, 10)
    const fields = ['username', 'password', 'role']
    const placeholders = ['?', '?', '?']
    const values = [username, hash, role]
    if (line_id !== null && line_id !== undefined && cols.includes('line_id')) {
      fields.push('line_id')
      placeholders.push('?')
      values.push(line_id)
    }
    const [res] = await pool.query(`INSERT INTO users (${fields.join(',')}) VALUES (${placeholders.join(',')})`, values)
    const row = { id: res.insertId, username, role, line_id }
    await addLog({ aksi: 'user_create', user: 'admin', metadata: { row } })
    return row
  }
  async function listLines() { 
    const { idCol, nameCol } = await getLinesSchema()
    const [rows] = await pool.query(`SELECT * FROM \`lines\` ORDER BY ${idCol} ASC`)
    return rows.map(r => ({ id: r[idCol], nama_line: r[nameCol] }))
  }
  async function createLine(payload) {
    const { nameCol } = await getLinesSchema()
    const [res] = await pool.query(`INSERT INTO \`lines\` (${nameCol}) VALUES (?)`, [payload.nama_line])
    const row = { id: res.insertId, ...payload }
    await addLog({ aksi: 'line_create', user: 'admin', metadata: { row } })
    return row
  }
  async function updateLine(id, payload) {
    const { idCol, nameCol } = await getLinesSchema()
    await pool.query(`UPDATE \`lines\` SET ${nameCol} = ? WHERE ${idCol} = ?`, [payload.nama_line, id])
    const row = { id, ...payload }
    await addLog({ aksi: 'line_update', user: 'admin', metadata: { id, payload } })
    return row
  }
  async function deleteLine(id) {
    const { idCol } = await getLinesSchema()
    await pool.query(`DELETE FROM \`lines\` WHERE ${idCol} = ?`, [id])
    await addLog({ aksi: 'line_delete', user: 'admin', metadata: { id } })
    return true
  }

  async function listStyles() { 
    const [rows] = await pool.query(`SELECT id, orc, po, style, color, quantity, DATE_FORMAT(shipmentdate, '%Y-%m-%d') as shipmentdate, deskripsi_orderan FROM styles`)
    return rows
  }
  async function listStylesByLine(lineId) {
    // Return ALL styles ever associated with this line (active or not)
    const [rows] = await pool.query(`
      SELECT DISTINCT s.id as style_id, s.style, s.orc
      FROM orders o 
      JOIN styles s ON o.style_id = s.id
      WHERE o.line_id = ?
      ORDER BY s.style ASC
    `, [lineId])
    
    if (rows.length === 0) {
        return []
    }
    return rows
  }
  async function createStyle(payload) {
    const [res] = await pool.query(
      `INSERT INTO styles (orc, po, style, color, quantity, shipmentdate, deskripsi_orderan) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [payload.orc, payload.po, payload.style, payload.color, payload.quantity, payload.shipmentdate, payload.deskripsi_orderan]
    )
    const row = { id: res.insertId, ...payload }
    await addLog({ aksi: 'style_create', style_id: row.id, user: 'admin', metadata: { row } })
    return row
  }
  async function updateStyle(id, payload) {
    await pool.query(
      `UPDATE styles SET orc = ?, po = ?, style = ?, color = ?, quantity = ?, shipmentdate = ?, deskripsi_orderan = ? WHERE id = ?`,
      [payload.orc, payload.po, payload.style, payload.color, payload.quantity, payload.shipmentdate, payload.deskripsi_orderan, id]
    )
    const row = { id, ...payload }
    await addLog({ aksi: 'style_update', style_id: id, user: 'admin', metadata: { id, payload } })
    return row
  }
  async function deleteStyle(id) {
    await pool.query(`DELETE FROM styles WHERE id = ?`, [id])
    await addLog({ aksi: 'style_delete', style_id: id, user: 'admin', metadata: { id } })
    return true
  }

  async function listProses(styleId) {
    let query = `SELECT * FROM proses`
    const params = []
    if (styleId) {
      query += ` WHERE style_id = ?`
      params.push(styleId)
    }
    query += ` ORDER BY urutan ASC`
    const [rows] = await pool.query(query, params)
    return rows
  }
  async function createProses(payload) {
    await ensureProsesDepsSchema()
    const [res] = await pool.query(`INSERT INTO proses (style_id, urutan, nama_proses, independent, next_proses_id) VALUES (?, ?, ?, ?, ?)`, [payload.style_id, payload.urutan, payload.nama_proses, payload.independent == null ? 1 : payload.independent, payload.next_proses_id || null])
    const row = { id: res.insertId, style_id: payload.style_id, urutan: payload.urutan, nama_proses: payload.nama_proses, independent: payload.independent == null ? 1 : payload.independent, next_proses_id: payload.next_proses_id || null }
    await addLog({ aksi: 'proses_create', style_id: payload.style_id, user: 'admin', metadata: { row } })
    return row
  }
  async function updateProses(id, payload) {
    await ensureProsesDepsSchema()
    await pool.query(`UPDATE proses SET urutan = ?, nama_proses = ?, independent = ?, next_proses_id = ? WHERE id = ?`, [payload.urutan, payload.nama_proses, payload.independent == null ? 1 : payload.independent, payload.next_proses_id || null, id])
    const row = { id, urutan: payload.urutan, nama_proses: payload.nama_proses, independent: payload.independent == null ? 1 : payload.independent, next_proses_id: payload.next_proses_id || null }
    await addLog({ aksi: 'proses_update', user: 'admin', metadata: { id, payload } })
    return row
  }
  async function deleteProses(id) {
    await pool.query(`DELETE FROM proses WHERE id = ?`, [id])
    await addLog({ aksi: 'proses_delete', user: 'admin', metadata: { id } })
    return true
  }
  async function getMaxUrutan(styleId) {
    const [rows] = await pool.query(`SELECT MAX(urutan) as max_urutan FROM proses WHERE style_id = ?`, [styleId])
    return rows[0].max_urutan || 0
  }

  async function listProsesMesin(styleId) {
    const procs = await listProses(styleId)
    return procs.map(p => ({
      proses_id: p.id,
      urutan: p.urutan,
      nama_proses: p.nama_proses,
      mesin_ids: prosesMesin.filter(x => x.style_id == styleId && x.proses_id == p.id).map(x => x.mesin_id)
    }))
  }
  async function setProsesMesin(styleId, prosesId, mesinIds) {
    const ids = Array.isArray(mesinIds) ? mesinIds : []
    
    // DB Update
    await pool.query('DELETE FROM proses_mesin WHERE style_id = ? AND proses_id = ?', [styleId, prosesId])
    for (const mid of ids) {
      if (typeof mid === 'number') {
        await pool.query('INSERT INTO proses_mesin (style_id, proses_id, mesin_id) VALUES (?, ?, ?)', [styleId, prosesId, mid])
      }
    }

    // Memory Update
    prosesMesin = prosesMesin.filter(x => !(x.style_id == styleId && x.proses_id == prosesId))
    ids.forEach(mid => {
      if (typeof mid === 'number') {
        prosesMesin.push({ style_id: styleId, proses_id: prosesId, mesin_id: mid })
      }
    })

    await addLog({ aksi: 'proses_mesin_set', user: 'admin', metadata: { style_id: styleId, proses_id: prosesId, mesin_ids: ids } })
    return true
  }
  async function setBulkProsesMesin(styleId, assignments) {
    const list = Array.isArray(assignments) ? assignments : []
    for (const a of list) {
      await setProsesMesin(styleId, a.proses_id, a.mesin_ids || [])
    }
    await addLog({ aksi: 'proses_mesin_bulk_set', user: 'admin', metadata: { style_id: styleId, count: list.length } })
    return true
  }

  async function listOrders() { 
    const [rows] = await pool.query(`
      SELECT o.*, c.transmitter_id 
      FROM orders o
      LEFT JOIN counters c ON o.id = c.order_id AND c.active = 1
    `)
    return rows
  }
  async function listActiveStylesByLine(lineId) {
    const [rows] = await pool.query(`
      SELECT DISTINCT s.id as style_id, s.style, s.orc, o.id as order_id, o.line_id
      FROM orders o 
      JOIN styles s ON o.style_id = s.id
      WHERE o.line_id = ? AND o.status = 'aktif'
      ORDER BY s.style ASC
    `, [lineId])
    
    if (rows.length === 0) {
      return []
    }
    
    return rows
  }
  async function createOrder(payload) {
    await ensureOrdersSchema()
    const [res] = await pool.query(
      `INSERT INTO orders (orc, line_id, style_id, mesin_id, proses_id, urutan, status) VALUES (?, ?, ?, ?, ?, ?, 'aktif')`,
      [payload.orc, payload.line_id, payload.style_id, payload.mesin_id, payload.proses_id, payload.urutan || 0]
    )
    const row = { id: res.insertId, ...payload, status: 'aktif' }
    await addLog({ aksi: 'order_create', line_id: row.line_id, style_id: row.style_id, user: 'admin', metadata: { row } })
    
    if (payload.transmitter_id) {
      await createCounter({ order_id: row.id, transmitter_id: payload.transmitter_id })
    }

    const proses = await listProses(row.style_id)
    return { order: row, proses }
  }
  async function updateOrder(id, payload) {
    // Handle Transmitter Change
    if (payload.transmitter_id !== undefined) {
        const [curr] = await pool.query('SELECT id, transmitter_id FROM counters WHERE order_id = ? AND active = 1', [id])
        const oldTx = curr ? curr.transmitter_id : null
        const newTx = payload.transmitter_id ? parseInt(payload.transmitter_id, 10) : null
        
        if (oldTx !== newTx) {
            if (curr) await deleteCounter(curr.id)
            if (newTx) await createCounter({ order_id: id, transmitter_id: newTx })
        }
    }

    const [cntRows] = await pool.query(`SELECT COUNT(*) as n FROM counters WHERE order_id = ? AND active = 1`, [id])
    const locked = (cntRows[0]?.n || 0) > 0
    const next = {
      orc: payload.orc,
      line_id: payload.line_id,
      style_id: payload.style_id,
      mesin_id: payload.mesin_id,
      proses_id: payload.proses_id
    }
    if (locked) {
      if (next.orc) {
        await pool.query(`UPDATE orders SET orc = ? WHERE id = ?`, [next.orc, id])
        await addLog({ aksi: 'order_update', user: 'admin', metadata: { id, payload: { orc: next.orc }, locked } })
      }
      return { id, ...next, status: 'aktif' } // Return merged state
    } else {
      await pool.query(`UPDATE orders SET orc = ?, line_id = ?, style_id = ?, mesin_id = ?, proses_id = ? WHERE id = ?`, [next.orc, next.line_id, next.style_id, next.mesin_id, next.proses_id, id])
      const row = { id, ...next, status: 'aktif' }
      await addLog({ aksi: 'order_update', line_id: row.line_id, style_id: row.style_id, user: 'admin', metadata: { id, payload: next, locked } })
      return row
    }
  }
  async function deleteOrder(id) {
    const [cntRows] = await pool.query(`SELECT COUNT(*) as n FROM counters WHERE order_id = ? AND active = 1`, [id])
    const locked = (cntRows[0]?.n || 0) > 0
    if (locked) return false
    await pool.query(`DELETE FROM orders WHERE id = ?`, [id])
    await addLog({ aksi: 'order_delete', user: 'admin', metadata: { id } })
    return true
  }

  async function listLines() { 
    const [rows] = await pool.query(`SELECT * FROM \`lines\` ORDER BY id ASC`)
    return rows
  }
  async function getDeviceByName(nama) {
    const [rows] = await pool.query(`SELECT * FROM devices WHERE nama = ? LIMIT 1`, [nama])
    return rows.length ? rows[0] : null
  }
  async function listDevices() { 
    const [rows] = await pool.query(`
      SELECT d.*, r.nama_rx 
      FROM devices d 
      LEFT JOIN receivers r ON d.rx_id = r.id
    `)
    return rows
  }
  async function createDevice(payload) {
    const [res] = await pool.query(`INSERT INTO devices (nama, tipe, status, tx_code, rx_id) VALUES (?, ?, ?, ?, ?)`, 
      [payload.nama, payload.tipe, payload.status || 'aktif', payload.tx_code || null, payload.rx_id || null])
    const row = { id: res.insertId, ...payload, status: payload.status || 'aktif' }
    await addLog({ aksi: 'device_create', transmitter_id: row.id, user: 'admin', metadata: { row } })
    return row
  }
  async function updateDeviceStatus(id, status) {
    await pool.query(`UPDATE devices SET status = ? WHERE id = ?`, [status, id])
    await addLog({ aksi: 'device_status', transmitter_id: id, user: 'admin', metadata: { status } })
    return { id, status }
  }
  async function updateDevice(id, payload) {
    const fields = []
    const values = []
    if (payload.nama !== undefined) { fields.push('nama = ?'); values.push(payload.nama); }
    if (payload.tx_code !== undefined) { fields.push('tx_code = ?'); values.push(payload.tx_code); }
    if (payload.rx_id !== undefined) { fields.push('rx_id = ?'); values.push(payload.rx_id); }
    
    if (fields.length === 0) return { id }
    
    values.push(id)
    await pool.query(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`, values)
    await addLog({ aksi: 'device_update', transmitter_id: id, user: 'admin', metadata: payload })
    return { id, ...payload }
  }
  async function deleteDevice(id) {
    const [cntRows] = await pool.query(`SELECT COUNT(*) as n FROM counters WHERE transmitter_id = ? AND active = 1`, [id])
    const locked = (cntRows[0]?.n || 0) > 0
    if (locked) return false
    await pool.query(`DELETE FROM counters WHERE transmitter_id = ? AND active = 0`, [id])
    await pool.query(`DELETE FROM devices WHERE id = ?`, [id])
    await addLog({ aksi: 'device_delete', transmitter_id: id, user: 'admin', metadata: { id } })
    return true
  }
  async function resetCounterByTransmitter(transmitterId) {
    const [lastRows] = await pool.query(
      `SELECT MAX(h.tanggal) as last_date FROM harian h WHERE h.transmitter_id = ?`,
      [transmitterId]
    )
    const lastDate = lastRows[0]?.last_date || todayStr()
    const [rows] = await pool.query(
      `SELECT h.line_id, h.style_id, SUM(h.output) as output, SUM(h.reject) as reject, SUM(h.repair) as repair
       FROM harian h 
       WHERE h.tanggal = ? AND h.transmitter_id = ?
       GROUP BY h.line_id, h.style_id`,
      [lastDate, transmitterId]
    )
    const summary = rows.reduce((acc, r) => ({
      output: acc.output + (r.output || 0),
      reject: acc.reject + (r.reject || 0),
      repair: acc.repair + (r.repair || 0)
    }), { output: 0, reject: 0, repair: 0 })
    await addLog({
      aksi: 'device_reset_counter',
      transmitter_id: transmitterId,
      user: 'admin',
      metadata: {
        tanggal: lastDate,
        before_reset: summary,
        per_detail: rows,
        description: 'Reset harian transmitter. Ringkasan sebelum reset pada tanggal tersebut.'
      }
    })
    await pool.query(`DELETE FROM harian WHERE tanggal = ? AND transmitter_id = ?`, [lastDate, transmitterId])
    return true
  }

  async function snapshotDailyForTransmitter(transmitterId) {
    const [lastRows] = await pool.query(
      `SELECT MAX(h.tanggal) as last_date FROM harian h WHERE h.transmitter_id = ?`,
      [transmitterId]
    )
    const lastDate = lastRows[0]?.last_date || null
    if (!lastDate) {
      await addLog({
        aksi: 'device_reset_counter',
        transmitter_id: transmitterId,
        user: 'system',
        metadata: {
          tanggal: null,
          before_reset: { output: 0, reject: 0, repair: 0 },
          per_detail: [],
          description: 'Snapshot reset otomatis: tidak ada data harian sebelumnya.'
        }
      })
      return true
    }
    const [rows] = await pool.query(
      `SELECT h.line_id, h.style_id, SUM(h.output) as output, SUM(h.reject) as reject, SUM(h.repair) as repair
       FROM harian h 
       WHERE h.tanggal = ? AND h.transmitter_id = ?
       GROUP BY h.line_id, h.style_id`,
      [lastDate, transmitterId]
    )
    const summary = rows.reduce((acc, r) => ({
      output: acc.output + (r.output || 0),
      reject: acc.reject + (r.reject || 0),
      repair: acc.repair + (r.repair || 0)
    }), { output: 0, reject: 0, repair: 0 })
    await addLog({
      aksi: 'device_reset_counter',
      transmitter_id: transmitterId,
      user: 'system',
      metadata: {
        tanggal: lastDate,
        before_reset: summary,
        per_detail: rows,
        description: 'Snapshot reset otomatis harian transmitter (sebelum reset).'
      }
    })
    return true
  }

  async function listCounters() { 
    const [rows] = await pool.query(`SELECT * FROM counters`)
    return rows
  }
  async function deleteCounter(id) {
    const [rows] = await pool.query(`SELECT * FROM counters WHERE id = ?`, [id])
    if (!rows.length) return false
    const row = rows[0]
    await pool.query(`UPDATE counters SET active = 0 WHERE id = ?`, [id])
    await updateDeviceStatus(row.transmitter_id, 'aktif')
    const assignDate = row.assigned_at ? new Date(row.assigned_at) : null
    const startDate = assignDate ? `${assignDate.getFullYear()}-${String(assignDate.getMonth() + 1).padStart(2, '0')}-${String(assignDate.getDate()).padStart(2, '0')}` : null
    let session = { output: 0, reject: 0, repair: 0 }
    let perDay = []
    if (startDate) {
      const [perDayRows] = await pool.query(
        `SELECT h.tanggal, h.line_id, h.style_id, SUM(h.output) as output, SUM(h.reject) as reject, SUM(h.repair) as repair
         FROM harian h 
         WHERE h.transmitter_id = ? AND h.tanggal >= ?
         GROUP BY h.tanggal, h.line_id, h.style_id
         ORDER BY h.tanggal ASC`,
        [row.transmitter_id, startDate]
      )
      perDay = perDayRows
      session = perDayRows.reduce((acc, r) => ({
        output: acc.output + (r.output || 0),
        reject: acc.reject + (r.reject || 0),
        repair: acc.repair + (r.repair || 0)
      }), { output: 0, reject: 0, repair: 0 })
    }
    await addLog({
      aksi: 'counter_delete',
      transmitter_id: row.transmitter_id,
      line_id: null,
      style_id: null,
      user: 'admin',
      metadata: {
        id,
        assigned_at: row.assigned_at,
        session_summary: session,
        per_day: perDay,
        description: 'Lepas transmitter dari order. Ringkasan produksi sejak mulai hingga selesai.'
      }
    })
    return true
  }
  async function getActiveOrderByTransmitter(transmitterId) {
    const [rows] = await pool.query(
      `SELECT o.* FROM counters c JOIN orders o ON c.order_id = o.id WHERE c.transmitter_id = ? AND c.active = 1 AND o.status = 'aktif' LIMIT 1`,
      [transmitterId]
    )
    return rows.length ? rows[0] : null
  }
  async function createCounter(payload) {
    // Validation & reactivate if existing inactive
    const [existingPair] = await pool.query(`SELECT * FROM counters WHERE order_id = ? AND transmitter_id = ?`, [payload.order_id, payload.transmitter_id])
    if (existingPair.length > 0) {
      const curr = existingPair[0]
      if (!curr.active) {
        await pool.query(`UPDATE counters SET active = 1, assigned_at = NOW() WHERE id = ?`, [curr.id])
        await updateDeviceStatus(payload.transmitter_id, 'digunakan')
        const row = { id: curr.id, order_id: payload.order_id, transmitter_id: payload.transmitter_id, active: true, assigned_at: new Date() }
        await addLog({ aksi: 'counter_activate', transmitter_id: payload.transmitter_id, user: 'admin', metadata: { row } })
        return row
      }
      return null
    }
    const [existingByOrder] = await pool.query(`SELECT * FROM counters WHERE order_id = ? AND active = 1`, [payload.order_id])
    if (existingByOrder.length > 0) return null
    
    const [devs] = await pool.query(`SELECT * FROM devices WHERE id = ? AND tipe = 'transmitter'`, [payload.transmitter_id])
    if (devs.length === 0 || devs[0].status !== 'aktif') return null
    
    const [res] = await pool.query(
      `INSERT INTO counters (order_id, transmitter_id, active, assigned_at) VALUES (?, ?, 1, NOW())`,
      [payload.order_id, payload.transmitter_id]
    )
    
    await updateDeviceStatus(payload.transmitter_id, 'digunakan')
    const row = { id: res.insertId, order_id: payload.order_id, transmitter_id: payload.transmitter_id, active: true, assigned_at: new Date() }
    await addLog({ aksi: 'counter_create', transmitter_id: payload.transmitter_id, user: 'admin', metadata: { row } })
    return row
  }

  // Deprecated but keeping signature for now (returning empty)
  async function listColors() { return [] }
  async function createColor() { return {} }
  async function updateColor() { return {} }
  async function deleteColor() { return true }

  // IoT Functions
  async function getTxByCode(code) {
    const [rows] = await pool.query('SELECT * FROM devices WHERE tx_code = ?', [code])
    return rows[0]
  }

  async function getRxById(id) {
    const [rows] = await pool.query('SELECT * FROM receivers WHERE id = ?', [id])
    return rows[0]
  }

  async function getRxForTx(txId) {
    const [rows] = await pool.query('SELECT r.* FROM devices d JOIN receivers r ON d.rx_id = r.id WHERE d.id = ?', [txId])
    return rows[0]
  }

  async function updateTxRx(txId, rxId) {
    await pool.query('UPDATE devices SET rx_id = ? WHERE id = ?', [rxId, txId])
    return true
  }

  async function listReceivers() {
    const [rows] = await pool.query('SELECT * FROM receivers')
    return rows
  }

  async function logProductionData(txId, type, count = 1, metadata = {}) {
    const [devs] = await pool.query('SELECT * FROM devices WHERE id = ?', [txId])
    if (!devs.length) return false
    const tx = devs[0]
    
    // Determine RX from TX (TX -> RX mapping)
    const rxId = tx.rx_id
    
    // Log raw production data
    await pool.query('INSERT INTO production_logs (tx_id, rx_id, type, count, metadata) VALUES (?, ?, ?, ?, ?)', 
      [txId, rxId, type, count, JSON.stringify(metadata)])

    // Sync with Admin Dashboard (Harian/Akumulasi) if assigned to active order
    const [counters] = await pool.query('SELECT * FROM counters WHERE transmitter_id = ? AND active = 1', [txId])
    if (counters.length > 0) {
        const counter = counters[0]
        const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [counter.order_id])
        if (orders.length > 0) {
            const order = orders[0]
            const date = todayStr()
            
            // Fetch process sequence (urutan) for complex calculation
            let urutan = 0
            if (order.proses_id) {
                const [procs] = await pool.query('SELECT urutan FROM proses WHERE id = ?', [order.proses_id])
                if (procs.length) urutan = procs[0].urutan
            }

            const delta = { output: 0, reject: 0, repair: 0 }
            if (type === 'output_garment' || type === 'accept') delta.output = count
            else if (type === 'reject') delta.reject = count
            else if (type === 'repair') delta.repair = count
            
            if (delta.output > 0 || delta.reject > 0 || delta.repair > 0) {
                await upsertHarian(date, order.line_id, order.style_id, txId, delta)
                await upsertAkumulasi(order.line_id, order.style_id, txId, delta)
                
                // Also log to audit logs for historical reports (preserves line/style context)
                // Metadata matches calculateFinalStats expectations
                await addLog({
                    aksi: 'produksi_input',
                    transmitter_id: txId,
                    line_id: order.line_id,
                    style_id: order.style_id,
                    user: 'system',
                    metadata: { 
                        type, 
                        event: type === 'output_garment' || type === 'accept' ? 'output' : type,
                        count, 
                        proses_aktif_urutan: urutan,
                        ...metadata 
                    }
                })

                // Emit Socket Event
                if (io) {
                    io.of('/dashboard').emit('update', {
                        type: 'production',
                        line_id: order.line_id,
                        style_id: order.style_id,
                        tx_id: txId,
                        delta
                    })
                }
            }
        }
    }

    return true
  }

  async function getIoTStats(filter = {}) {
    // 1. Bar chart per TX (Harian - Today)
    const [txStats] = await pool.query(`
      SELECT 
        d.tx_code, d.nama as tx_name,
        COALESCE(SUM(CASE WHEN pl.type = 'accept' THEN pl.count ELSE 0 END), 0) as accept,
        COALESCE(SUM(CASE WHEN pl.type = 'reject' THEN pl.count ELSE 0 END), 0) as reject,
        COALESCE(SUM(CASE WHEN pl.type = 'repair' THEN pl.count ELSE 0 END), 0) as repair,
        COALESCE(SUM(CASE WHEN pl.type = 'output_garment' OR pl.type = 'accept' THEN pl.count ELSE 0 END), 0) as output_garment,
        MAX(s.quantity) as order_qty
      FROM devices d
      LEFT JOIN counters c ON d.id = c.transmitter_id AND c.active = 1
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN styles s ON o.style_id = s.id
        ${filter.line_id ? ' AND o.line_id = ?' : ''}
        ${filter.style_id ? ' AND o.style_id = ?' : ''}
      LEFT JOIN production_logs pl ON d.id = pl.tx_id AND DATE(pl.timestamp) = CURDATE()
      WHERE d.tipe = 'transmitter'
      GROUP BY d.id
    `, [ ...(filter.line_id ? [filter.line_id] : []), ...(filter.style_id ? [filter.style_id] : []) ])

    // 1b. Bar chart per TX (Akumulasi - All Time)
    const [txStatsAccumulated] = await pool.query(`
      SELECT 
        d.tx_code, d.nama as tx_name,
        COALESCE(SUM(CASE WHEN pl.type = 'accept' THEN pl.count ELSE 0 END), 0) as accept,
        COALESCE(SUM(CASE WHEN pl.type = 'reject' THEN pl.count ELSE 0 END), 0) as reject,
        COALESCE(SUM(CASE WHEN pl.type = 'repair' THEN pl.count ELSE 0 END), 0) as repair,
        COALESCE(SUM(CASE WHEN pl.type = 'output_garment' OR pl.type = 'accept' THEN pl.count ELSE 0 END), 0) as output_garment,
        MAX(s.quantity) as order_qty
      FROM devices d
      LEFT JOIN counters c ON d.id = c.transmitter_id AND c.active = 1
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN styles s ON o.style_id = s.id
        ${filter.line_id ? ' AND o.line_id = ?' : ''}
        ${filter.style_id ? ' AND o.style_id = ?' : ''}
      LEFT JOIN production_logs pl ON d.id = pl.tx_id
      WHERE d.tipe = 'transmitter'
      GROUP BY d.id
    `, [ ...(filter.line_id ? [filter.line_id] : []), ...(filter.style_id ? [filter.style_id] : []) ])

    // 2. Stacked bar chart per RX (showing contribution of each TX or total items)
    // The requirement: "Stacked bar chart per RX (total TX di RX)"
    // Interpreted as: X-axis = RX, Stacked segments = TXs, Y-axis = Total Items (or Count of TXs?)
    // "total TX di RX" sounds like a count of TXs. But a stacked bar of count?
    // Maybe it means "Total Output per RX, stacked by TX". This is more useful.
    // Or "Total items (accept/reject...) per RX".
    // Let's provide breakdown of Output per RX by TX.
    
    const [rxStats] = await pool.query(`
      SELECT 
        r.id as rx_id, r.nama_rx,
        d.tx_code,
        COALESCE(SUM(pl.count), 0) as total_items
      FROM receivers r
      LEFT JOIN devices d ON r.id = d.rx_id
      LEFT JOIN counters c ON d.id = c.transmitter_id AND c.active = 1
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN production_logs pl ON d.id = pl.tx_id AND DATE(pl.timestamp) = CURDATE()
      ${filter.line_id || filter.style_id ? 'WHERE 1=1' : ''}
      ${filter.line_id ? ' AND o.line_id = ?' : ''}
      ${filter.style_id ? ' AND o.style_id = ?' : ''}
      GROUP BY r.id, d.id
    `, [ ...(filter.line_id ? [filter.line_id] : []), ...(filter.style_id ? [filter.style_id] : []) ])

    // 3. Line chart akumulasi harian
    const whereParts = []
    const params = []
    if (filter.line_id || filter.style_id) {
      whereParts.push(`EXISTS (
        SELECT 1 FROM counters c 
        JOIN orders o ON c.order_id = o.id 
        WHERE c.transmitter_id = production_logs.tx_id AND c.active = 1
        ${filter.line_id ? ' AND o.line_id = ?' : ''}
        ${filter.style_id ? ' AND o.style_id = ?' : ''}
      )`)
      if (filter.line_id) params.push(filter.line_id)
      if (filter.style_id) params.push(filter.style_id)
    }
    const [dailyStats] = await pool.query(`
      SELECT 
        DATE_FORMAT(timestamp, '%Y-%m-%d') as date,
        SUM(CASE WHEN type = 'accept' THEN count ELSE 0 END) as accept,
        SUM(CASE WHEN type = 'reject' THEN count ELSE 0 END) as reject,
        SUM(CASE WHEN type = 'repair' THEN count ELSE 0 END) as repair,
        SUM(CASE WHEN type = 'output_garment' OR type = 'accept' THEN count ELSE 0 END) as output_garment
      FROM production_logs
      ${whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : ''}
      GROUP BY DATE_FORMAT(timestamp, '%Y-%m-%d')
      ORDER BY date ASC
      LIMIT 30
    `, params)

    const finalHarian = await summaryFinalHarian(filter.line_id, filter.style_id)
    const finalAkumulasi = await summaryFinalAkumulasi(filter.line_id, filter.style_id)

    return {
      txStats,
      txStatsAccumulated,
      rxStats,
      dailyStats,
      summary_harian: finalHarian.summary,
      summary_akumulasi: finalAkumulasi.summary
    }
  }

  return {
    upsertHarian, upsertAkumulasi, summary, summaryFinalHarian, summaryFinalAkumulasi, resetDaily, addLog,
    getLogs, todayStr,
    getProductionSummary,
    listMesin, createMesin, updateMesin, deleteMesin,
    getUser, listUsers,
    listLines, createLine, updateLine, deleteLine,
    listStyles, listStylesByLine, createStyle, updateStyle, deleteStyle,
    listProses, createProses, updateProses, deleteProses, getMaxUrutan, listProsesMesin, setProsesMesin, setBulkProsesMesin,
    listOrders, createOrder, updateOrder, deleteOrder, listActiveStylesByLine,
    listDevices, createDevice, updateDeviceStatus,
    listCounters, createCounter, getActiveOrderByTransmitter, updateDevice, deleteDevice, resetCounterByTransmitter, deleteCounter,
    snapshotDailyForTransmitter, listColors, createColor, updateColor, deleteColor, clearLogs, getDeviceByName,
    // IoT
    getTxByCode, getRxById, getRxForTx, updateTxRx, listReceivers, logProductionData, getIoTStats
  }
}

module.exports = { createStore }
