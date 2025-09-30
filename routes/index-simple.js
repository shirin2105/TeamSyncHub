const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const { requireAuth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs-extra');

// Authentication middleware
function authenticateToken(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    }
    next();
}

// Authorization middleware for manager only
function authorizeManager(req, res, next) {
    if (req.user.role !== 'Manager') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
}

// Trang chủ - hiển thị danh sách emails
router.get('/', requireAuth, async (req, res) => {
    try {
        const emails = await emailService.getAllEmailsWithAttachments();
        res.render('index', { 
            emails, 
            title: 'Email Manager - Inbox',
            user: req.user 
        });
    } catch (error) {
        console.error('Error loading emails:', error);
        res.render('index', { 
            emails: [], 
            title: 'Email Manager - Inbox', 
            error: 'Lỗi khi tải emails',
            user: req.user 
        });
    }
});

// Chi tiết email
router.get('/email/:id', requireAuth, async (req, res) => {
    try {
        const emailId = req.params.id;
        console.log(`📧 Loading email detail for ID: ${emailId}`);
        console.log(`👤 User: ${req.user.name} Role: ${req.user.role}`);
        
        // Load email data
        const email = await emailService.getEmailById(emailId);
        if (!email) {
            return res.status(404).render('error', { 
                message: 'Email không tồn tại',
                title: 'Lỗi'
            });
        }
        console.log(`✅ Email loaded: ${email.subject}`);

        // Load discussions
        const discussions = [];
        console.log(`💬 Discussions loaded: ${discussions.length}`);

        // Load task info (dummy data for now)
        const taskInfo = {
            isAssigned: false,
            assignedTo: undefined,
            assignedBy: undefined,
            status: undefined,
            canReply: false
        };
        console.log(`📋 Task info loaded:`, taskInfo);

        // Load all users for task assignment
        const db = require('../config/database');
        const allUsers = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM users', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        console.log(`👥 All users loaded: ${allUsers.length}`);

        console.log(`🎨 Rendering email-detail-new template...`);
        res.render('email-detail-new', { 
            email, 
            discussions,
            taskInfo,
            allUsers,
            title: `Email - ${email.subject}`,
            user: req.user
        });

    } catch (error) {
        console.error('❌ Error loading email detail:', error);
        res.status(500).render('error', { 
            message: 'Có lỗi xảy ra khi tải email',
            title: 'Lỗi'
        });
    }
});

// Preview file
router.get('/preview/:emailId/:filename', requireAuth, async (req, res) => {
    try {
        const { emailId, filename } = req.params;
        const db = require('../config/database');
        
        console.log(`📊 Preview request: emailId=${emailId}, filename=${filename}`);
        
        // Find attachment info
        const attachment = await new Promise((resolve, reject) => {
            db.get(`
                SELECT * FROM attachments 
                WHERE email_id = ? AND (filename = ? OR original_filename = ?)
            `, [emailId, filename, filename], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!attachment) {
            return res.status(404).send('<div class="alert alert-danger">File không tồn tại</div>');
        }

        const filePath = path.resolve(__dirname, '..', attachment.file_path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('<div class="alert alert-danger">File không tìm thấy trên hệ thống</div>');
        }

        const ext = path.extname(filename).toLowerCase();
        
        // Handle different file types
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
            // Image preview
            const imageUrl = `/download/${emailId}/${encodeURIComponent(filename)}`;
            res.send(`
                <div class="text-center">
                    <img src="${imageUrl}" class="img-fluid" style="max-height: 70vh;" alt="${filename}">
                </div>
            `);
        } else if (['.pdf'].includes(ext)) {
            // PDF preview
            const pdfUrl = `/download/${emailId}/${encodeURIComponent(filename)}`;
            res.send(`
                <iframe src="${pdfUrl}" style="width: 100%; height: 70vh; border: none;"></iframe>
            `);
        } else if (['.txt', '.log', '.md'].includes(ext)) {
            // Text file preview
            const content = fs.readFileSync(filePath, 'utf8');
            res.send(`
                <pre style="white-space: pre-wrap; word-wrap: break-word; max-height: 70vh; overflow-y: auto;">${content}</pre>
            `);
        } else {
            // Default preview
            res.send(`
                <div class="alert alert-info">
                    <h5><i class="fas fa-file"></i> ${filename}</h5>
                    <p>Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</p>
                    <p>Loại file này không thể xem trước. Vui lòng tải xuống để xem.</p>
                    <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary">
                        <i class="fas fa-download"></i> Tải xuống
                    </a>
                </div>
            `);
        }

    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).send('<div class="alert alert-danger">Có lỗi xảy ra khi xem trước file</div>');
    }
});

// Download file
router.get('/download/:emailId/:filename', requireAuth, async (req, res) => {
    try {
        const { emailId, filename } = req.params;
        const db = require('../config/database');
        
        // Find attachment
        const attachment = await new Promise((resolve, reject) => {
            db.get(`
                SELECT * FROM attachments 
                WHERE email_id = ? AND (filename = ? OR original_filename = ?)
            `, [emailId, filename, filename], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!attachment) {
            return res.status(404).send('File không tồn tại');
        }

        const filePath = path.resolve(__dirname, '..', attachment.file_path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File không tìm thấy trên hệ thống');
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        // Send file
        res.sendFile(filePath);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Lỗi khi tải file');
    }
});

// API: Giao nhiệm vụ
router.post('/assign-task', requireAuth, authorizeManager, async (req, res) => {
    try {
        const { emailId, employeeId } = req.body;
        const managerId = req.user.id;

        if (!emailId || !employeeId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email hoặc nhân viên' });
        }

        // TODO: Implement task assignment logic
        console.log(`Assigning email ${emailId} to employee ${employeeId} by manager ${managerId}`);
        
        res.json({ success: true, message: 'Giao nhiệm vụ thành công' });
    } catch (error) {
        console.error('Error assigning task:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi giao nhiệm vụ' });
    }
});

// API: Hoàn thành nhiệm vụ
router.post('/complete-task', requireAuth, async (req, res) => {
    try {
        const { emailId } = req.body;
        const userId = req.user.id;

        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email' });
        }

        // TODO: Implement task completion logic
        console.log(`Completing task for email ${emailId} by user ${userId}`);
        
        res.json({ success: true, message: 'Hoàn thành nhiệm vụ thành công' });
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi hoàn thành nhiệm vụ' });
    }
});

// API: Bắt đầu nhiệm vụ
router.post('/start-task', requireAuth, async (req, res) => {
    try {
        const { emailId } = req.body;
        const userId = req.user.id;

        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email' });
        }

        // TODO: Implement task start logic
        console.log(`Starting task for email ${emailId} by user ${userId}`);
        
        res.json({ success: true, message: 'Bắt đầu nhiệm vụ thành công' });
    } catch (error) {
        console.error('Error starting task:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi bắt đầu nhiệm vụ' });
    }
});

// API: Hủy giao nhiệm vụ
router.post('/unassign-task', requireAuth, authorizeManager, async (req, res) => {
    try {
        const { emailId } = req.body;
        const managerId = req.user.id;

        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email' });
        }

        // TODO: Implement task unassignment logic
        console.log(`Unassigning task for email ${emailId} by manager ${managerId}`);
        
        res.json({ success: true, message: 'Hủy giao nhiệm vụ thành công' });
    } catch (error) {
        console.error('Error unassigning task:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi hủy giao nhiệm vụ' });
    }
});

module.exports = router;
