const express = require('express');
const passport = require('../config/passportConfig');
const router = express.Router();

// Trang đăng nhập
router.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('login', { 
        title: 'Đăng nhập - Email Manager',
        error: req.flash('error')
    });
});

// Google OAuth routes
router.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Đăng nhập thành công
        console.log(`✅ User logged in via Google: ${req.user.email}`);
        res.redirect('/');
    }
);

// Microsoft OAuth routes
router.get('/auth/microsoft',
    passport.authenticate('microsoft', { scope: ['user.read'] })
);

router.get('/auth/microsoft/callback',
    passport.authenticate('microsoft', { failureRedirect: '/login' }),
    (req, res) => {
        // Đăng nhập thành công
        console.log(`✅ User logged in via Microsoft: ${req.user.email}`);
        res.redirect('/');
    }
);

// Đăng xuất
router.get('/logout', (req, res) => {
    const userEmail = req.user?.email;
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).render('error', { 
                message: 'Lỗi khi đăng xuất',
                title: 'Lỗi'
            });
        }
        
        console.log(`👋 User logged out: ${userEmail}`);
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/login');
        });
    });
});

// API endpoint để lấy thông tin user hiện tại
router.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            provider: req.user.provider,
            avatar_url: req.user.avatar_url,
            role: req.user.role
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

module.exports = router;
