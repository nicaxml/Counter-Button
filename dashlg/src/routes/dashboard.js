const express = require('express')
const router = express.Router()

let storeRef

function attachStore(store) {
  storeRef = store
}

router.get('/', async (req, res) => {
  const scope = req.query.scope === 'akumulasi' ? 'akumulasi' : 'harian'
  const line_id = req.query.line_id ? parseInt(req.query.line_id, 10) : null
  const style_id = req.query.style_id ? parseInt(req.query.style_id, 10) : null
  const data = await storeRef.summary(scope, line_id, style_id)
  
  const finalHarian = await storeRef.summaryFinalHarian(line_id, style_id)
  const finalAkumulasi = await storeRef.summaryFinalAkumulasi(line_id, style_id)

  data.summary_harian = finalHarian.summary
  data.summary_akumulasi = finalAkumulasi.summary

  // Legacy logic: Override removed to distinguish between Raw Output (summary) and Final Output (summary_harian)
  // if (scope === 'harian') {
  //   data.summary = finalHarian.summary
  // } else {
  //   data.summary = finalAkumulasi.summary
  // }
  
  res.json({ scope, ...data, filters: { line_id, style_id } })
})

module.exports = { router, attachStore }
