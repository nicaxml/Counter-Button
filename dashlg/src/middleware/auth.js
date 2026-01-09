const requireAuth = (req, res, next) => {
  const authDisabled = String(process.env.DISABLE_AUTH || '').trim() === '1'
  if (req.path === '/admin.html' && !authDisabled && (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'superadmin' && req.session.user.role !== 'manager'))) {
    return res.redirect('/')
  }
  if (req.path === '/manager.html' && !authDisabled && (!req.session.user || (req.session.user.role !== 'manager' && req.session.user.role !== 'superadmin' && req.session.user.role !== 'admin'))) {
    return res.redirect('/')
  }
  if (req.path === '/superadmin.html' && !authDisabled && (!req.session.user || req.session.user.role !== 'superadmin')) {
    return res.redirect('/')
  }
  next()
}

const requireApiAuth = (req, res, next) => {
  const authDisabled = String(process.env.DISABLE_AUTH || '').trim() === '1'
  if (!authDisabled && !req.session.isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

const requireSuperAdmin = (req, res, next) => {
  const authDisabled = String(process.env.DISABLE_AUTH || '').trim() === '1'
  if (authDisabled) return next()
  
  if (!req.session.isSuperAdmin) {
    return res.status(403).json({ error: 'Forbidden: Superadmin access required' })
  }
  next()
}

module.exports = { requireAuth, requireApiAuth, requireSuperAdmin }
