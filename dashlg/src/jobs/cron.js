const cron = require('node-cron')

function setupCron(store, io) {
  cron.schedule('0 0 * * *', async () => {
    await store.resetDaily()
    try {
      const devices = await store.listDevices()
      const txs = devices.filter(d => d.tipe === 'transmitter')
      for (const tx of txs) {
        await store.snapshotDailyForTransmitter(tx.id)
      }
    } catch (e) {
      // ignore snapshot errors
    }
    io.of('/dashboard').to('dashboard').emit('reset:done', { date: new Date().toISOString().slice(0, 10), counters_reset: true })
  })
}

module.exports = { setupCron }
