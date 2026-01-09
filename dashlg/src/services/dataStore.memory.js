function createKey(date, lineId, styleId, txId) {
  return [date, lineId, styleId, txId].join('|')
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function createStore() {
  const harian = new Map()
  const akumulasi = new Map()
  const logs = []
  const productionLogs = []
  let mesin = []
  let lines = []
  let styles = []
  let proses = []
  let orders = []
  let counters = []
  let devices = []
  let receivers = []
  let colors = []
  let prosesMesin = []
  let seqMesin = 1
  let seqLine = 1
  let seqStyle = 1
  let seqProses = 1
  let seqOrder = 1
  let seqCounter = 1
  let seqDevice = 1
  let seqColor = 1
  let seqReceiver = 1

  function upsertHarian(date, lineId, styleId, txId, delta) {
    const key = createKey(date, lineId, styleId, txId)
    const curr = harian.get(key) || { output: 0, reject: 0, repair: 0, line_id: lineId, style_id: styleId, transmitter_id: txId, tanggal: date }
    const next = { ...curr, output: curr.output + (delta.output || 0), reject: curr.reject + (delta.reject || 0), repair: curr.repair + (delta.repair || 0) }
    harian.set(key, next)
    return next
  }

  function upsertAkumulasi(lineId, styleId, txId, delta) {
    const key = createKey('acc', lineId, styleId, txId)
    const curr = akumulasi.get(key) || { total_output: 0, total_reject: 0, total_repair: 0, line_id: lineId, style_id: styleId, transmitter_id: txId }
    const next = { ...curr, total_output: curr.total_output + (delta.output || 0), total_reject: curr.total_reject + (delta.reject || 0), total_repair: curr.total_repair + (delta.repair || 0), updated_at: new Date().toISOString() }
    akumulasi.set(key, next)
    return next
  }

  function summary(scope, lineId, styleId) {
    if (scope === 'harian') {
      const date = todayStr()
      const arr = Array.from(harian.values()).filter(r => {
        if (r.tanggal !== date) return false
        if (lineId && r.line_id != lineId) return false
        if (styleId && r.style_id != styleId) return false
        const hasOrder = orders.some(o => o.line_id == r.line_id && o.style_id == r.style_id && o.status === 'aktif')
        if (!hasOrder) return false
        const counter = counters.find(c => c.transmitter_id == r.transmitter_id && c.active)
        if (!counter) return false
        const ord = orders.find(o => o.id == counter.order_id && o.status === 'aktif')
        if (!ord) return false
        return ord.line_id == r.line_id && ord.style_id == r.style_id
      })
      const sum = arr.reduce((a, r) => ({ output: a.output + r.output, reject: a.reject + r.reject, repair: a.repair + r.repair }), { output: 0, reject: 0, repair: 0 })
      const byTx = arr.map(r => ({ transmitter_id: r.transmitter_id, nama: `TX-${r.transmitter_id}`, output: r.output, reject: r.reject, repair: r.repair }))
      return { summary: sum, by_transmitter: byTx }
    } else {
      const arr = Array.from(akumulasi.values()).filter(r => {
        if (lineId && r.line_id != lineId) return false
        if (styleId && r.style_id != styleId) return false
        const hasOrder = orders.some(o => o.line_id == r.line_id && o.style_id == r.style_id && o.status === 'aktif')
        if (!hasOrder) return false
        const counter = counters.find(c => c.transmitter_id == r.transmitter_id && c.active)
        if (!counter) return false
        const ord = orders.find(o => o.id == counter.order_id && o.status === 'aktif')
        if (!ord) return false
        return ord.line_id == r.line_id && ord.style_id == r.style_id
      })
      const sum = arr.reduce((a, r) => ({ output: a.output + r.total_output, reject: a.reject + r.total_reject, repair: a.repair + r.total_repair }), { output: 0, reject: 0, repair: 0 })
      const byTx = arr.map(r => ({ transmitter_id: r.transmitter_id, nama: `TX-${r.transmitter_id}`, output: r.total_output, reject: r.total_reject, repair: r.total_repair }))
      return { summary: sum, by_transmitter: byTx }
    }
  }

  function calculateFinalStats(filteredLogs, lineId, styleId) {
    const perStyleOutputByUrutan = new Map()
    const perStyleRejectByUrutan = new Map()
    const perStyleRepairByUrutan = new Map()
    
    for (const log of filteredLogs) {
      const meta = log.metadata || {}
      const sid = meta.style_id || log.style_id
      const lid = meta.line_id || log.line_id
      
      if (lineId && lid != lineId) continue
      if (styleId && sid != styleId) continue
      
      const event = (meta.event || '').toLowerCase()
      const urutan = meta.proses_aktif_urutan
      
      if (!event || !urutan) continue
      
      if (!perStyleOutputByUrutan.has(sid)) perStyleOutputByUrutan.set(sid, new Map())
      if (!perStyleRejectByUrutan.has(sid)) perStyleRejectByUrutan.set(sid, new Map())
      if (!perStyleRepairByUrutan.has(sid)) perStyleRepairByUrutan.set(sid, new Map())
      
      if (event === 'output') {
        const m = perStyleOutputByUrutan.get(sid)
        m.set(urutan, (m.get(urutan) || 0) + 1)
      } else if (event === 'reject') {
        const m = perStyleRejectByUrutan.get(sid)
        m.set(urutan, (m.get(urutan) || 0) + 1)
      } else if (event === 'repair') {
        const m = perStyleRepairByUrutan.get(sid)
        m.set(urutan, (m.get(urutan) || 0) + 1)
      }
    }
    
    let totalOutput = 0, totalReject = 0, totalRepair = 0
    
    for (const sid of perStyleOutputByUrutan.keys()) {
       const max = getMaxUrutan(sid)
       if (!max || max <= 0) continue
       
       let capacity = Infinity
       const outMap = perStyleOutputByUrutan.get(sid)
       for (let u = 1; u <= max; u++) {
         const count = outMap.get(u) || 0
         capacity = Math.min(capacity, count)
       }
       if (!isFinite(capacity)) capacity = 0
       
       const outFinal = outMap.get(max) || 0
       const rejFinal = perStyleRejectByUrutan.get(sid)?.get(max) || 0
       const repFinal = perStyleRepairByUrutan.get(sid)?.get(max) || 0
       
       const outputCount = Math.min(outFinal, capacity)
       const remaining = Math.max(capacity - outputCount, 0)
       const rejectCount = Math.min(rejFinal, remaining)
       const remaining2 = Math.max(remaining - rejectCount, 0)
       const repairCount = Math.min(repFinal, remaining2)
       
       totalOutput += outputCount
       totalReject += rejectCount
       totalRepair += repairCount
    }
    
    return { summary: { output: totalOutput, reject: totalReject, repair: totalRepair } }
  }

  function summaryFinalHarian(lineId, styleId) {
    const date = todayStr()
    const filtered = logs.filter(l => l.aksi === 'produksi_input' && l.timestamp.startsWith(date))
    return calculateFinalStats(filtered, lineId, styleId)
  }

  function summaryFinalAkumulasi(lineId, styleId) {
    const filtered = logs.filter(l => l.aksi === 'produksi_input')
    return calculateFinalStats(filtered, lineId, styleId)
  }

  function resetDaily() {
    const date = todayStr()
    Array.from(harian.keys()).forEach(k => {
      const v = harian.get(k)
      if (v && v.tanggal !== date) {
        harian.delete(k)
      }
    })
    return true
  }

  function addLog(entry) {
    logs.push({ id: logs.length + 1, timestamp: new Date().toISOString(), ...entry })
  }

  function getLogs(filter) {
    return logs.filter(l => (!filter.aksi || l.aksi === filter.aksi) && (!filter.line_id || l.line_id == filter.line_id) && (!filter.style_id || l.style_id == filter.style_id))
  }

  function listMesin() { return mesin }
  function createMesin(payload) {
    const row = { id: seqMesin++, nama: payload.nama, kategori: payload.kategori, jenis: payload.jenis, merk: payload.merk }
    mesin.push(row)
    addLog({ aksi: 'mesin_create', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { row } })
    return row
  }
  function updateMesin(id, payload) {
    const idx = mesin.findIndex(m => m.id == id)
    if (idx === -1) return null
    mesin[idx] = { ...mesin[idx], ...payload }
    addLog({ aksi: 'mesin_update', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id, payload } })
    return mesin[idx]
  }
  function deleteMesin(id) {
    const idx = mesin.findIndex(m => m.id == id)
    if (idx === -1) return false
    const removed = mesin.splice(idx, 1)
    addLog({ aksi: 'mesin_delete', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id } })
    return !!removed
  }

  function listLines() { return lines }
  function createLine(payload) {
    const row = { id: seqLine++, nama_line: payload.nama_line }
    lines.push(row)
    addLog({ aksi: 'line_create', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { row } })
    return row
  }
  function updateLine(id, payload) {
    const idx = lines.findIndex(m => m.id == id)
    if (idx === -1) return null
    lines[idx] = { ...lines[idx], ...payload }
    addLog({ aksi: 'line_update', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id, payload } })
    return lines[idx]
  }
  function deleteLine(id) {
    const idx = lines.findIndex(m => m.id == id)
    if (idx === -1) return false
    const removed = lines.splice(idx, 1)
    addLog({ aksi: 'line_delete', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id } })
    return !!removed
  }

  function listStyles() { return styles }
  function createStyle(payload) {
    const row = { id: seqStyle++, orc: payload.orc, po: payload.po, style: payload.style, color: payload.color, quantity: payload.quantity, shipmentdate: payload.shipmentdate, deskripsi_orderan: payload.deskripsi_orderan }
    styles.push(row)
    addLog({ aksi: 'style_create', transmitter_id: null, line_id: null, style_id: row.id, user: 'admin', metadata: { row } })
    return row
  }
  function updateStyle(id, payload) {
    const idx = styles.findIndex(m => m.id == id)
    if (idx === -1) return null
    styles[idx] = { ...styles[idx], ...payload }
    addLog({ aksi: 'style_update', transmitter_id: null, line_id: null, style_id: id, user: 'admin', metadata: { id, payload } })
    return styles[idx]
  }
  function deleteStyle(id) {
    const idx = styles.findIndex(m => m.id == id)
    if (idx === -1) return false
    const removed = styles.splice(idx, 1)
    addLog({ aksi: 'style_delete', transmitter_id: null, line_id: null, style_id: id, user: 'admin', metadata: { id } })
    return !!removed
  }

  function listProses(styleId) {
    return proses.filter(p => !styleId || p.style_id == styleId).sort((a, b) => a.urutan - b.urutan)
  }
  function createProses(payload) {
    const row = { id: seqProses++, style_id: payload.style_id, urutan: payload.urutan, nama_proses: payload.nama_proses }
    proses.push(row)
    addLog({ aksi: 'proses_create', transmitter_id: null, line_id: null, style_id: payload.style_id, user: 'admin', metadata: { row } })
    return row
  }
  function deleteProses(id) {
    const idx = proses.findIndex(p => p.id == id)
    if (idx === -1) return false
    const removed = proses.splice(idx, 1)
    addLog({ aksi: 'proses_delete', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id } })
    return !!removed
  }
  function getMaxUrutan(styleId) {
    const list = listProses(styleId)
    return list.length ? Math.max(...list.map(p => p.urutan)) : 0
  }

  function listProsesMesin(styleId) {
    const procs = listProses(styleId)
    return procs.map(p => ({
      proses_id: p.id,
      urutan: p.urutan,
      nama_proses: p.nama_proses,
      mesin_ids: prosesMesin.filter(x => x.style_id == styleId && x.proses_id == p.id).map(x => x.mesin_id)
    }))
  }
  function setProsesMesin(styleId, prosesId, mesinIds) {
    prosesMesin = prosesMesin.filter(x => !(x.style_id == styleId && x.proses_id == prosesId))
    const ids = Array.isArray(mesinIds) ? mesinIds : []
    ids.forEach(mid => {
      if (typeof mid === 'number' && mesin.find(m => m.id == mid)) {
        prosesMesin.push({ style_id: styleId, proses_id: prosesId, mesin_id: mid })
      }
    })
    addLog({ aksi: 'proses_mesin_set', transmitter_id: null, line_id: null, style_id: styleId, user: 'admin', metadata: { proses_id: prosesId, mesin_ids: ids } })
    return true
  }
  function setBulkProsesMesin(styleId, assignments) {
    const list = Array.isArray(assignments) ? assignments : []
    list.forEach(a => {
      setProsesMesin(styleId, a.proses_id, a.mesin_ids || [])
    })
    addLog({ aksi: 'proses_mesin_bulk_set', transmitter_id: null, line_id: null, style_id: styleId, user: 'admin', metadata: { count: list.length } })
    return true
  }

  function listOrders() { return orders }
  function createOrder(payload) {
    const row = { id: seqOrder++, orc: payload.orc, line_id: payload.line_id, style_id: payload.style_id, mesin_id: payload.mesin_id, proses_id: payload.proses_id, status: 'aktif' }
    orders.push(row)
    addLog({ aksi: 'order_create', transmitter_id: null, line_id: row.line_id, style_id: row.style_id, user: 'admin', metadata: { row } })
    return { order: row, proses: listProses(row.style_id) }
  }
  function updateOrder(id, payload) {
      const idx = orders.findIndex(o => o.id == id)
      if (idx === -1) return null
      orders[idx] = { ...orders[idx], ...payload }
      addLog({ aksi: 'order_update', metadata: { id, payload } })
      return orders[idx]
  }
  function deleteOrder(id) {
      const idx = orders.findIndex(o => o.id == id)
      if (idx === -1) return false
      
      // Remove associated counters
      let i = counters.length
      while (i--) {
        if (counters[i].order_id == id) {
          const txId = counters[i].transmitter_id
          updateDeviceStatus(txId, 'aktif') // Reset device status
          counters.splice(i, 1)
        }
      }

      orders.splice(idx, 1)
      addLog({ aksi: 'order_delete', metadata: { id } })
      return true
  }

  function listDevices() { return devices }
  function createDevice(payload) {
    const row = { id: seqDevice++, nama: payload.nama, tipe: payload.tipe, status: payload.status || 'aktif', tx_code: payload.tx_code || null, rx_id: payload.rx_id || null }
    devices.push(row)
    addLog({ aksi: 'device_create', transmitter_id: row.id, line_id: null, style_id: null, user: 'admin', metadata: { row } })
    return row
  }
  function getTxByCode(code) {
    return devices.find(d => d.tx_code === code)
  }
  function updateDeviceStatus(id, status) {
    const idx = devices.findIndex(d => d.id == id)
    if (idx === -1) return null
    devices[idx] = { ...devices[idx], status }
    addLog({ aksi: 'device_status', transmitter_id: id, line_id: null, style_id: null, user: 'admin', metadata: { status } })
    return devices[idx]
  }
  function updateDevice(id, payload) {
      const idx = devices.findIndex(d => d.id == id)
      if (idx === -1) return null
      devices[idx] = { ...devices[idx], ...payload }
      return devices[idx]
  }
  function deleteDevice(id) {
      const idx = devices.findIndex(d => d.id == id)
      if (idx === -1) return false
      devices.splice(idx, 1)
      return true
  }
  function getDeviceByName(name) {
      return devices.find(d => d.nama === name)
  }
  function listReceivers() { return receivers }
  function getRxById(id) { return receivers.find(r => r.id == id) }
  function updateTxRx(txId, rxId) {
    const d = devices.find(x => x.id == txId)
    if (!d) return false
    d.rx_id = rxId
    return true
  }
  function createReceiver(payload) {
    const row = { id: seqReceiver++, nama_rx: payload.nama_rx, ip_address: payload.ip_address || null }
    receivers.push(row)
    return row
  }

  function listCounters() { return counters }
  function createCounter(payload) {
    const exists = counters.find(c => c.order_id == payload.order_id && c.transmitter_id == payload.transmitter_id)
    if (exists) return null
    const dev = devices.find(d => d.id == payload.transmitter_id && d.tipe === 'transmitter')
    if (!dev || dev.status !== 'aktif') return null
    const row = { id: seqCounter++, order_id: payload.order_id, transmitter_id: payload.transmitter_id, active: true, assigned_at: new Date().toISOString() }
    counters.push(row)
    updateDeviceStatus(payload.transmitter_id, 'digunakan')
    addLog({ aksi: 'counter_create', transmitter_id: payload.transmitter_id, line_id: null, style_id: null, user: 'admin', metadata: { row } })
    return row
  }
  function getActiveOrderByTransmitter(txId) {
    const counter = counters.find(c => c.transmitter_id == txId && c.active)
    if (!counter) return null
    const order = orders.find(o => o.id == counter.order_id && o.status === 'aktif')
    return order || null
  }
  function resetCounterByTransmitter(txId) { return true }
  function deleteCounter(id) { return true }

  function listColors() { return colors }
  function createColor(payload) {
    const row = { id: seqColor++, name: payload.name }
    colors.push(row)
    addLog({ aksi: 'color_create', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { row } })
    return row
  }
  function updateColor(id, payload) {
    const idx = colors.findIndex(c => c.id == id)
    if (idx === -1) return null
    colors[idx] = { ...colors[idx], ...payload }
    addLog({ aksi: 'color_update', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id, payload } })
    return colors[idx]
  }
  function deleteColor(id) {
    const idx = colors.findIndex(c => c.id == id)
    if (idx === -1) return false
    const removed = colors.splice(idx, 1)
    addLog({ aksi: 'color_delete', transmitter_id: null, line_id: null, style_id: null, user: 'admin', metadata: { id } })
    return !!removed
  }
  
  function getProductionSummary() { return { output: 0, reject: 0, repair: 0 } }
  function snapshotDailyForTransmitter() {}
  function clearLogs() { logs.length = 0; return true }
  function getUser(username) {
    if (username === 'admin') {
      return { 
        id: 1, 
        username: 'admin', 
        password: '$2b$10$02nViMEU2nxXiSE7scA74OGoYPJpGyDjDp9HEuhAUbhXeicP0.PvO', // admin123
        role: 'admin' 
      }
    }
    return null
  }
  function listUsers() {
    return [{ id: 1, username: 'admin', role: 'admin' }]
  }
  function logProductionData(txId, type, count = 1, metadata = {}) {
    const tx = devices.find(d => d.id == txId)
    if (!tx) return false
    const rxId = tx.rx_id || null
    productionLogs.push({ id: productionLogs.length + 1, timestamp: new Date().toISOString(), tx_id: txId, rx_id: rxId, type, count, metadata })
    const counter = counters.find(c => c.transmitter_id == txId && c.active)
    if (counter) {
      const order = orders.find(o => o.id == counter.order_id && o.status === 'aktif')
      if (order) {
        const date = todayStr()
        const delta = { output: 0, reject: 0, repair: 0 }
        const t = String(type)
        if (t === 'output_garment' || t === 'accept') delta.output = count
        else if (t === 'reject') delta.reject = count
        else if (t === 'repair') delta.repair = count
        upsertHarian(date, order.line_id, order.style_id, txId, delta)
        upsertAkumulasi(order.line_id, order.style_id, txId, delta)
      }
    }
    return true
  }
  function getIoTStats(filter = {}) {
    const today = todayStr()
    const txActive = new Set(counters.filter(c => c.active).map(c => c.transmitter_id))
    const txStats = devices
      .filter(d => d.tipe === 'transmitter' && txActive.has(d.id))
      .map(d => {
        const logsToday = productionLogs.filter(pl => pl.tx_id == d.id && pl.timestamp.slice(0,10) === today)
        const sum = (t) => logsToday.filter(pl => pl.type === t).reduce((a, b) => a + (b.count || 0), 0)
        return {
          tx_code: d.tx_code || d.nama,
          tx_name: d.nama,
          accept: sum('accept'),
          reject: sum('reject'),
          repair: sum('repair'),
          output_garment: sum('output_garment') + sum('accept')
        }
      })
    const rxStats = receivers.map(r => {
      const devs = devices.filter(d => d.rx_id == r.id)
      const byTx = devs.map(d => {
        const total = productionLogs.filter(pl => pl.tx_id == d.id && pl.timestamp.slice(0,10) === today).reduce((a, b) => a + (b.count || 0), 0)
        return { rx_id: r.id, nama_rx: r.nama_rx, tx_code: d.tx_code || d.nama, total_items: total }
      })
      return byTx
    }).flat()
    const dailyMap = new Map()
    for (const pl of productionLogs) {
      const dt = pl.timestamp.slice(0,10)
      const curr = dailyMap.get(dt) || { accept: 0, reject: 0, repair: 0, output_garment: 0 }
      if (pl.type === 'accept') curr.accept += pl.count || 0
      else if (pl.type === 'reject') curr.reject += pl.count || 0
      else if (pl.type === 'repair') curr.repair += pl.count || 0
      else if (pl.type === 'output_garment') curr.output_garment += pl.count || 0
      dailyMap.set(dt, curr)
    }
    const dailyStats = Array.from(dailyMap.entries())
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, v]) => ({ 
        date, 
        accept: v.accept, 
        reject: v.reject, 
        repair: v.repair, 
        output_garment: (v.output_garment || 0) + (v.accept || 0)
      }))

    const finalHarian = summaryFinalHarian(filter.line_id, filter.style_id)
    const finalAkumulasi = summaryFinalAkumulasi(filter.line_id, filter.style_id)

    return { txStats, rxStats, dailyStats, summary_harian: finalHarian.summary, summary_akumulasi: finalAkumulasi.summary }
  }

  return {
    upsertHarian, upsertAkumulasi, summary, summaryFinalHarian, summaryFinalAkumulasi, resetDaily, addLog,
    getLogs, todayStr,  getProductionSummary,
    listMesin, createMesin, updateMesin, deleteMesin,
    getUser, listUsers,
    listLines, createLine, updateLine, deleteLine,
    listStyles, createStyle, updateStyle, deleteStyle,
    listProses, createProses, deleteProses, getMaxUrutan, listProsesMesin, setProsesMesin, setBulkProsesMesin,
    listOrders, createOrder, updateOrder, deleteOrder,
    listDevices, createDevice, updateDeviceStatus,
    listCounters, createCounter, getActiveOrderByTransmitter, updateDevice, deleteDevice, resetCounterByTransmitter, deleteCounter,
    snapshotDailyForTransmitter, listColors, createColor, updateColor, deleteColor, clearLogs, getDeviceByName,
    getTxByCode, getRxById, updateTxRx, listReceivers, logProductionData, getIoTStats, createReceiver
  }
}

module.exports = { createStore }
