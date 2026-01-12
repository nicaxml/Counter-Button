const clockEl = document.getElementById('clock')
const styleFilterEl = document.getElementById('styleFilter')
const currentStyleLabelEl = document.getElementById('currentStyleLabel')
const lineLabelEl = document.getElementById('currentLineLabel')
const noOrderNoticeEl = document.getElementById('noOrderNotice')
const userLabelEl = document.getElementById('currentUserLabel')
const styleFieldEl = document.getElementById('styleField')
const logoutBtn = document.getElementById('logoutBtn')
const summaryOutputEl = document.getElementById('summaryOutput')
const summaryOutputHarianEl = document.getElementById('summaryOutputHarian')
const summaryOutputAkumulasiEl = document.getElementById('summaryOutputAkumulasi')
const summaryRejectEl = document.getElementById('summaryReject')
const rejectWarningEl = document.getElementById('rejectWarning')
const ctxTx = document.getElementById('chartTx').getContext('2d')
const ctxDaily = document.getElementById('chartDaily').getContext('2d')

let chartTxRef = null
let chartDailyRef = null
let currentLineId = null
let currentStyleId = null
let hasOrders = true

function tickClock() {
  const s = new Date().toLocaleString('id-ID')
  if(clockEl) clockEl.textContent = s
}

function getQueryParams() {
  const u = new URL(window.location.href)
  return {
    line_id: u.searchParams.get('line_id'),
    style_id: u.searchParams.get('style_id')
  }
}

async function initFilters() {
  const { line_id, style_id } = getQueryParams()
  currentLineId = line_id ? parseInt(line_id, 10) : null
  currentStyleId = style_id ? parseInt(style_id, 10) : null
  try {
    const meRes = await fetch('/api/me')
    const meData = await meRes.json()
    const me = meData && meData.user ? meData.user : null
    if (me && userLabelEl) userLabelEl.textContent = me.username || '-'
    if (me && me.line_id && !currentLineId) currentLineId = parseInt(me.line_id, 10)
    
    // Role-based View Customization
    if (me && me.role === 'user') {
      // User: Tampilkan navbar, waktu realtime, toggle logout, dan grid ringkas
      const header = document.querySelector('header')
      const toolbar = document.querySelector('.toolbar-card')
      const main = document.querySelector('main')
      if (header) header.style.display = ''
      if (toolbar) toolbar.style.display = ''
      if (main) {
        main.style.padding = '1rem'
        main.style.height = ''
      }
      if (!currentLineId && me.line_id) currentLineId = parseInt(me.line_id, 10)
    }
  } catch {}
  if (lineLabelEl) {
    if (currentLineId) {
      try {
        const res = await fetch('/api/iot/lines')
        const lines = await res.json()
        const found = Array.isArray(lines) ? lines.find(l => l.id == currentLineId) : null
        lineLabelEl.textContent = found ? (found.nama_line || `Line ${currentLineId}`) : `Line ${currentLineId}`
      } catch {
        lineLabelEl.textContent = `Line ${currentLineId}`
      }
    } else {
      lineLabelEl.textContent = 'Semua'
    }
  }
  if (styleFilterEl) {
    styleFilterEl.innerHTML = '<option value="">Semua</option>'
    if (currentLineId) {
      try {
        // Fetch ACTIVE styles only (sedang dikerjakan)
        let res = await fetch(`/api/iot/styles_by_line?line_id=${encodeURIComponent(currentLineId)}&_t=${Date.now()}`)
        let rows = await res.json()
        
        // Normalize IoT response
        if (Array.isArray(rows)) {
           // Strict Filter: Ensure data belongs to this line
           rows = rows.filter(r => !r.line_id || String(r.line_id) === String(currentLineId));
           
           rows = rows.map(s => ({ id: s.style_id, style: s.style, orc: s.orc }));
        }



        if (Array.isArray(rows) && rows.length > 0) {
          hasOrders = true
          
          // Deduplicate
          const seen = new Set()
          rows.forEach(r => {
            const id = r.id || r.style_id
            if(seen.has(id)) return
            seen.add(id)
            const opt = document.createElement('option')
            opt.value = String(id)
            opt.textContent = `${r.style} (${r.orc})`
            styleFilterEl.appendChild(opt)
          })
          
          // Check if single style logic is still desired? 
          // Maybe better to always show dropdown for consistency
          if (rows.length === 1 && false) { // Disabled single-style hiding for now to force dropdown appearance
            // Single style: Hide dropdown, show label
            if (styleFilterEl) styleFilterEl.style.display = 'none'
            if (currentStyleLabelEl) {
              currentStyleLabelEl.style.display = 'block'
              currentStyleLabelEl.textContent = rows[0].style
            }
            // Auto-select if not already selected
            if (!currentStyleId) currentStyleId = rows[0].style_id
          } else {
            // Multiple styles: Show dropdown, hide label
            if (styleFilterEl) styleFilterEl.style.display = 'block'
            if (currentStyleLabelEl) currentStyleLabelEl.style.display = 'none'
            
            if (currentStyleId) styleFilterEl.value = String(currentStyleId)
            styleFilterEl.addEventListener('change', () => {
              currentStyleId = styleFilterEl.value ? parseInt(styleFilterEl.value, 10) : null
              loadData()
            })
          }
        } else {
          hasOrders = false
          // Tetap tampilkan grid gaya dengan placeholder "Semua"
          if (styleFieldEl) styleFieldEl.style.display = ''
          styleFilterEl.innerHTML = '<option value="">Semua</option>'
          if (currentStyleLabelEl) {
            currentStyleLabelEl.style.display = 'block'
            currentStyleLabelEl.textContent = '-'
          }
          if (noOrderNoticeEl) {
            noOrderNoticeEl.style.display = ''
          }
        }
      } catch {}
    } else {
      // Tampilkan field style meskipun tanpa line spesifik
      if (styleFieldEl) styleFieldEl.style.display = ''
    }
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      try {
        await fetch('/api/logout', { method: 'POST' })
      } catch {}
      window.location.href = '/'
    })
  }
}

function getHourlyColor() {
  const hour = new Date().getHours()
  const colors = [
    '#10b981', // 0: Emerald (Default Green)
    '#0ea5e9', // 1: Sky Blue
    '#6366f1', // 2: Indigo
    '#8b5cf6', // 3: Violet
    '#d946ef', // 4: Fuchsia
    '#f43f5e', // 5: Rose
    '#f59e0b', // 6: Amber
    '#84cc16', // 7: Lime
    '#06b6d4', // 8: Cyan
    '#3b82f6', // 9: Blue
    '#a855f7', // 10: Purple
    '#ec4899', // 11: Pink
  ]
  return colors[hour % colors.length]
}

async function loadData() {
  try {
    if (currentLineId && !hasOrders) {
      if (chartTxRef) { chartTxRef.destroy(); chartTxRef = null }
      if (chartDailyRef) { chartDailyRef.destroy(); chartDailyRef = null }
      return
    }
    if (noOrderNoticeEl) noOrderNoticeEl.style.display = 'none'
    const qs = new URLSearchParams()
    if (currentLineId) qs.set('line_id', String(currentLineId))
    if (currentStyleId) qs.set('style_id', String(currentStyleId))
    const res = await fetch('/api/iot/stats' + (qs.toString() ? `?${qs.toString()}` : ''))
    const data = await res.json()
    // console.log(data);

    // Update Summary Grid
    if (data.txStats) {
      const totalOutput = data.txStats.reduce((sum, item) => sum + (item.output_garment || 0), 0)
      const totalReject = data.txStats.reduce((sum, item) => sum + (item.reject || 0), 0)
      
      if (summaryOutputEl) summaryOutputEl.textContent = totalOutput
      if (summaryRejectEl) summaryRejectEl.textContent = totalReject
      
      // Check Reject Tolerance (1%)
      const tolerance = totalOutput * 0.01
      if (rejectWarningEl) {
        if (totalReject > tolerance && totalReject > 0) {
          rejectWarningEl.style.display = 'block'
          rejectWarningEl.textContent = `PERINGATAN: Reject (${totalReject}) melebihi batas toleransi 1% (${tolerance.toFixed(1)})!`
        } else {
          rejectWarningEl.style.display = 'none'
        }
      }

      // Update new fields
      if (summaryOutputHarianEl && data.summary_harian) {
        summaryOutputHarianEl.textContent = data.summary_harian.output
      }
      if (summaryOutputAkumulasiEl && data.summary_akumulasi) {
        summaryOutputAkumulasiEl.textContent = data.summary_akumulasi.output
      }
    }

    renderTxChart(data.txStats, data.summary_harian?.output)
    renderDailyChart(data.txStatsAccumulated, data.summary_akumulasi?.output)
  } catch (e) {
    console.error('Failed to load IoT stats', e)
  }
}

function renderTxChart(items, finalOutput) {
  chartTxRef = renderCommonChart(ctxTx, items, chartTxRef, false, finalOutput)
}

function renderDailyChart(items, finalOutput) {
  chartDailyRef = renderCommonChart(ctxDaily, items, chartDailyRef, true, finalOutput)
}

function renderCommonChart(ctx, items, chartRef, isAccumulated, finalOutputOverride) {
  if (chartRef) chartRef.destroy()
  if (!items || items.length === 0) return null

  const orderQty = items[0].order_qty || 0
  const sumOutput = items.reduce((acc, curr) => acc + (curr.output_garment || 0), 0)
  const totalOutput = finalOutputOverride !== undefined ? finalOutputOverride : sumOutput
  
  const labels = items.map(i => i.tx_name || i.tx_code)
  labels.push('Order')

  const outputs = items.map(i => i.output_garment || 0)
  outputs.push(totalOutput)

  const rejects = items.map(i => i.reject || 0)
  rejects.push(0)

  const targets = items.map(() => 0)
  targets.push(orderQty)

  const plugin = {
    id: 'customLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      ctx.save()
      
      const outputMeta = chart.getDatasetMeta(1) // Output
      outputMeta.data.forEach((bar, index) => {
        const val = outputs[index]
        let pct = orderQty > 0 ? Math.round((val / orderQty) * 100) : 0
        
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.font = 'bold 11px Inter'
        ctx.fillStyle = '#111827'
        
        if (index === labels.length - 1) {
          // Target Bar
          ctx.fillText(`${val} (${pct}%)`, bar.x, bar.y - 5)
          const targetMeta = chart.getDatasetMeta(0)
          const targetBar = targetMeta.data[index]
          if (targetBar) {
             ctx.fillStyle = '#6b7280'
             ctx.fillText(`Order: ${orderQty}`, targetBar.x, targetMeta.hidden ? bar.y - 20 : targetBar.y - 20)
          }
        } else {
          // Process Bars
          ctx.fillText(val, bar.x, bar.y - 14)
          ctx.font = '10px Inter'
          ctx.fillStyle = '#4b5563'
          ctx.fillText(`${pct}%`, bar.x, bar.y - 2)
        }
      })
      
      const rejectMeta = chart.getDatasetMeta(2) // Reject
      rejectMeta.data.forEach((bar, index) => {
         const val = rejects[index]
         if (val > 0) {
           ctx.fillStyle = '#ef4444'
           ctx.font = 'bold 10px Inter'
           ctx.textAlign = 'center'
           ctx.fillText(val, bar.x, bar.y - 2)
         }
      })
      ctx.restore()
    }
  }

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Target',
          data: targets,
          backgroundColor: '#e5e7eb',
          order: 3,
          barPercentage: 0.8,
          categoryPercentage: 0.8,
          grouped: false
        },
        {
          label: 'Output',
          data: outputs,
          backgroundColor: '#10b981', // Green for Output
          // backgroundColor: isAccumulated ? '#8b5cf6' : getHourlyColor(),
          order: 2,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
          grouped: false
        },
        {
          label: 'Reject',
          data: rejects,
          backgroundColor: '#ef4444',
          order: 1,
          barPercentage: 0.3,
          categoryPercentage: 0.8,
          grouped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { usePointStyle: true } },
        tooltip: { enabled: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { borderDash: [2, 2] }, stacked: false },
        x: { grid: { display: false }, stacked: false }
      }
    },
    plugins: [plugin]
  })
}




// Init
tickClock()
setInterval(tickClock, 1000)
initFilters().then(loadData)
setInterval(loadData, 5000) // Poll every 5s
