// Middleware kiểm tra user đã đăng nhập
function requireAuth(req, res, next) {
    console.log('🔐 Auth check:', {
        authenticated: req.isAuthenticated(),
        user: req.user ? req.user.email : 'No user',
        path: req.path
    });
    
    if (req.isAuthenticated()) {
        return next();
    }
    
    // For API calls, return JSON
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required. Please login first.' 
        });
    }
    
    // Nếu chưa đăng nhập, redirect tới trang login
    res.redirect('/login');
}

// Middleware kiểm tra quyền admin
function requireAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    
    res.status(403).render('error', { 
        message: 'Bạn không có quyền truy cập tính năng này',
        title: 'Lỗi quyền truy cập'
    });
}

// Middleware set user info cho views
function setUserInfo(req, res, next) {
    res.locals.user = req.user || null;
    res.locals.isAuthenticated = req.isAuthenticated();
    next();
}

module.exports = {
    requireAuth,
    requireAdmin,
    setUserInfo
};
