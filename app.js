const express = require('express');
const session = require('express-session');
const passport = require('./config/passportConfig');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs-extra');

// Thực hiện thay thế database nếu cần
try {
    require('./replace-db');
} catch (err) {
    console.error('Lỗi khi thay thế database:', err.message);
}

const db = require('./config/database');
const schedulerService = require('./services/schedulerService');
const { setUserInfo } = require('./middleware/auth');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'email-manager-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        secure: false // Set to true in production with HTTPS
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set user info for all views
app.use(setUserInfo);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routes/auth')); // Auth routes first
app.use('/', require('./routes/index'));  // Main routes with auth protection

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).render('error', { 
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        message: 'Trang không tìm thấy.' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Email Manager App is running on http://localhost:${PORT}`);
    console.log('Starting email scheduler...');
    
    // Bắt đầu scheduler kiểm tra email
    schedulerService.startEmailChecker();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    schedulerService.stopEmailChecker();
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    schedulerService.stopEmailChecker();
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

module.exports = app;
