const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const DiscussionService = require('../services/discussionService');
const TaskService = require('../services/taskService');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');

// Authorization middleware for manager only
function authorizeManager(req, res, next) {
    if (req.user.role !== 'Manager') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
}

// Cấu hình multer để upload files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const date = moment();
        const folderStructure = date.format('YYYY/MM/DD');
        const uploadPath = path.join(__dirname, '..', 'attachments', 'outgoing', folderStructure);
        fs.ensureDirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const timeStamp = moment().format('HHmmss');
        const fileName = `${path.parse(file.originalname).name}_${timeStamp}${path.parse(file.originalname).ext}`;
        cb(null, fileName);
    }
});

const upload = multer({ storage: storage });

// Test route for debugging auth
router.get('/test-auth', (req, res) => {
    console.log('🧪 Test auth route hit');
    console.log('👤 User:', req.user ? req.user.email : 'No user');
    console.log('🔐 Authenticated:', req.isAuthenticated());
    console.log('📝 Session:', req.session ? Object.keys(req.session) : 'No session');
    res.json({ 
        message: 'Test successful',
        user: req.user ? req.user.email : 'No user',
        authenticated: req.isAuthenticated(),
        session: req.session ? Object.keys(req.session) : 'No session'
    });
});

// New debug route for checking auth status
router.get('/debug-auth', (req, res) => {
    res.json({
        isAuthenticated: req.isAuthenticated(),
        user: req.user || null,
        session: req.session || null,
        cookies: req.headers.cookie || null
    });
});

// Create default user for testing
router.get('/create-default-user', (req, res) => {
    const db = require('../config/database');
    
    db.run(`
        INSERT OR REPLACE INTO users (id, email, name, provider, provider_id, role, avatar_url)
        VALUES (1, 'test@example.com', 'Test User', 'local', 'test-user', 'Manager', 'https://via.placeholder.com/40')
    `, [], function(err) {
        if (err) {
            console.error('Error creating default user:', err);
            res.json({ success: false, error: err.message });
        } else {
            console.log('✅ Default user created');
            // Log the user in
            req.login({ 
                id: 1, 
                email: 'test@example.com', 
                name: 'Test User', 
                provider: 'local',
                provider_id: 'test-user',
                role: 'Manager' 
            }, (err) => {
                if (err) {
                    res.json({ success: false, error: 'Login failed' });
                } else {
                    res.json({ success: true, message: 'Default user created and logged in' });
                }
            });
        }
    });
});

// Debug route to get email IDs
router.get('/debug-emails', (req, res) => {
    const db = require('../config/database');
    
    db.all(`
        SELECT e.id, e.subject, e.sender, e.email_type, e.message_id,
               COUNT(a.id) as attachment_count
        FROM emails e 
        LEFT JOIN attachments a ON e.id = a.email_id 
        WHERE e.email_type = 'incoming'
        GROUP BY e.id 
        ORDER BY e.id DESC 
        LIMIT 10
    `, [], (err, rows) => {
        if (err) {
            res.json({ success: false, error: err.message });
        } else {
            res.json({ success: true, emails: rows });
        }
    });
});

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
            title: 'TeamSync Hub - Inbox',
            user: req.user 
        });
    } catch (error) {
        console.error('Error loading emails:', error);
        res.render('index', { 
            emails: [], 
            title: 'TeamSync Hub - Inbox', 
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
        console.log(`📎 Email attachments:`, email.attachments ? `${email.attachments.length} attachments` : 'No attachments property');
        if (email.attachments && email.attachments.length > 0) {
            email.attachments.forEach((att, i) => {
                console.log(`  📄 Attachment ${i+1}: ${att.filename} (${att.file_size} bytes)`);
            });
        }

        // Lấy discussions cho email này (với fallback)
        let discussions = [];
        try {
            discussions = await DiscussionService.getDiscussionsByEmailId(req.params.id);
            if (!discussions) {
                discussions = [];
            }
            console.log('💬 Discussions loaded:', discussions.length);
        } catch (discussionError) {
            console.error('Error loading discussions:', discussionError);
            discussions = [];
        }

        // Load task info based on email assignment
        const taskInfo = {
            isAssigned: !!email.assigned_to_id,
            assignedTo: email.assigned_to_name || email.assigned_to_user_name,
            assignedToId: email.assigned_to_id,
            assignedBy: email.assigned_by_name || email.assigned_by_user_name,
            status: email.task_status || 'pending',
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

        console.log(`🎨 Rendering email-detail template...`);
        res.render('email-detail', { 
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

// Trang sent emails - hiển thị danh sách email đã gửi
router.get('/sent', requireAuth, async (req, res) => {
    try {
        const emails = await emailService.getSentEmailsWithAttachments();
        res.render('sent', { 
            emails, 
            title: 'TeamSync Hub - Sent',
            user: req.user 
        });
    } catch (error) {
        console.error('Error loading sent emails:', error);
        res.render('sent', { 
            emails: [], 
            title: 'TeamSync Hub - Sent', 
            error: 'Lỗi khi tải emails đã gửi',
            user: req.user 
        });
    }
});

// Trang compose - soạn email mới
router.get('/compose', requireAuth, async (req, res) => {
    try {
        // Extract query parameters for pre-filling form
        const formData = {
            to: req.query.to || '',
            subject: req.query.subject || '',
            body: req.query.body || ''
        };
        
        res.render('compose', { 
            title: 'TeamSync Hub - Compose',
            user: req.user,
            formData: formData
        });
    } catch (error) {
        console.error('Error loading compose page:', error);
        res.render('error', { 
            message: 'Lỗi khi tải trang soạn email',
            title: 'Lỗi'
        });
    }
});

// Xử lý gửi email
router.post('/send', requireAuth, upload.array('attachments'), async (req, res) => {
    try {
        const { to, subject, body, emailFormat } = req.body;
        const toRecipients = to.split(',').map(email => email.trim());
        
        console.log(`📧 Sending email with format: ${emailFormat || 'html'}`);
        console.log(`📧 To: ${to}`);
        console.log(`📧 Subject: ${subject}`);

        const emailData = {
            toRecipients,
            subject,
            body: body,
            attachments: []
        };

        // Xử lý attachments nếu có
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const fileContent = await fs.readFile(file.path);
                const base64Content = fileContent.toString('base64');

                emailData.attachments.push({
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: file.originalname,
                    contentBytes: base64Content,
                    contentType: file.mimetype
                });
            }
        }

        // Gửi email với định dạng được chọn
        const sendResult = await emailService.sendEmail(
            to, 
            subject, 
            body, 
            req.files || [],
            emailFormat // Pass email format preference
        );

        console.log(`✅ Email sent via ${sendResult.provider}`);
        console.log(`📧 Message ID: ${sendResult.messageId}`);

        // Lưu email đã gửi vào database
        const sentEmail = {
            id: `sent_${Date.now()}`,
            subject,
            body: { content: body },
            sentDateTime: new Date().toISOString(),
            toRecipients: toRecipients.map(email => ({ emailAddress: { address: email } }))
        };

        const emailId = await emailService.saveEmailToDatabase(sentEmail, 'outgoing');

        // Lưu thông tin attachments vào database
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await emailService.saveAttachment(emailId, {
                    name: file.originalname,
                    size: file.size,
                    contentType: file.mimetype
                }, 'outgoing');
            }
        }

        res.redirect('/?success=Email đã được gửi thành công');
    } catch (error) {
        console.error('Error sending email:', error);
        // Don't pass formData back to avoid persistence of values
        res.render('compose', { 
            title: 'TeamSync Hub - Compose', 
            error: 'Lỗi khi gửi email: ' + error.message,
            user: req.user
        });
    }
});

// Preview file - support both routes for compatibility
router.get('/preview/:emailId/:filename', requireAuth, async (req, res) => {
    try {
        const { emailId, filename } = req.params;
        const db = require('../config/database');
        
        console.log(`📊 Preview request: emailId=${emailId}, filename=${filename}`);
        
        // Find attachment info
        console.log(`🔍 Looking for attachment: emailId=${emailId}, filename=${decodeURIComponent(filename)}`);
        
        const decodedFilename = decodeURIComponent(filename);
        
        const attachment = await new Promise((resolve, reject) => {
            db.get(`
                SELECT * FROM attachments 
                WHERE email_id = ? AND (filename = ? OR ? LIKE '%' || filename || '%' OR filename LIKE '%' || ? || '%')
            `, [emailId, decodedFilename, decodedFilename, decodedFilename], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        console.log('Preview attachment query result:', attachment ? 'Found' : 'Not found');

        if (!attachment) {
            return res.status(404).send('<div class="alert alert-danger">File không tồn tại</div>');
        }

        const filePath = path.resolve(__dirname, '..', attachment.file_path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('<div class="alert alert-danger">File không tìm thấy trên hệ thống</div>');
        }

        const ext = path.extname(filename).toLowerCase();
        console.log('Preview ext:', ext);
        console.log('Attachment path:', filePath);
        console.log('Attachment exists:', fs.existsSync(filePath));
        // Handle different file types - only files that can actually be previewed on web
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) {
            console.log('Preview type: image');
            // Image preview
            const imageUrl = `/download/${emailId}/${encodeURIComponent(filename)}?preview=true`;
            res.send(`
                <div class="text-center">
                    <img src="${imageUrl}" class="img-fluid" style="max-height: 70vh;" alt="${filename}">
                    <div class="mt-3">
                        <h6>${filename}</h6>
                        <p class="text-muted">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</p>
                        <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary" download>
                            <i class="fas fa-download"></i> Tải xuống
                        </a>
                    </div>
                </div>
            `);
        } else if (['.pdf'].includes(ext)) {
            console.log('Preview type: pdf');
            // PDF preview - embedded viewer with multiple options
            const pdfUrl = `/download/${emailId}/${encodeURIComponent(filename)}?preview=true`;
            res.send(`
                <div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6><i class="fas fa-file-pdf text-danger"></i> ${filename}</h6>
                        <div>
                            <span class="text-muted me-3">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</span>
                            <div class="btn-group me-2">
                                <button class="btn btn-sm btn-outline-danger active" onclick="viewInBrowser()">
                                    <i class="fas fa-eye"></i> Trình duyệt
                                </button>
                                <button class="btn btn-sm btn-outline-success" onclick="viewWithGoogleDocs()">
                                    <i class="fab fa-google"></i> Google Docs
                                </button>
                            </div>
                            <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-sm btn-primary" download>
                                <i class="fas fa-download"></i> Tải xuống
                            </a>
                        </div>
                    </div>
                    <div class="alert alert-info mb-3">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-file-pdf fa-2x text-danger me-3"></i>
                            <div>
                                <strong>PDF Document</strong>
                                <p class="mb-0 small">Đang sử dụng trình duyệt để hiển thị PDF. Nếu không hiển thị, hãy thử Google Docs hoặc tải xuống.</p>
                            </div>
                        </div>
                    </div>
                    <div id="pdfViewer" style="height: 70vh; border: 1px solid #dee2e6; border-radius: 5px;">
                        <iframe id="pdfFrame" 
                                style="width: 100%; height: 100%; border: none;">
                        </iframe>
                    </div>
                    <script>
                        const fullPdfUrl = window.location.origin + '${pdfUrl}';
                        
                        function viewInBrowser() {
                            document.getElementById('pdfFrame').src = fullPdfUrl + '#toolbar=1&view=FitH';
                            
                            // Update button states
                            document.querySelector('[onclick="viewInBrowser()"]').classList.add('active');
                            document.querySelector('[onclick="viewWithGoogleDocs()"]').classList.remove('active');
                        }
                        
                        function viewWithGoogleDocs() {
                            const googleUrl = 'https://docs.google.com/viewer?url=' + encodeURIComponent(fullPdfUrl) + '&embedded=true';
                            document.getElementById('pdfFrame').src = googleUrl;
                            
                            // Update button states
                            document.querySelector('[onclick="viewInBrowser()"]').classList.remove('active');
                            document.querySelector('[onclick="viewWithGoogleDocs()"]').classList.add('active');
                        }
                        
                        // Initialize with browser viewer - load after DOM is ready
                        document.addEventListener('DOMContentLoaded', function() {
                            setTimeout(function() {
                                viewInBrowser();
                            }, 100);
                        });
                    </script>
                </div>
            `);
        } else if (['.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls'].includes(ext)) {
            console.log('Preview type: office');
            // Microsoft Office files preview with online viewers
            const officeUrl = `/download/${emailId}/${encodeURIComponent(filename)}?preview=true`;
            
            const iconClass = {
                '.docx': 'fa-file-word text-primary', '.doc': 'fa-file-word text-primary',
                '.pptx': 'fa-file-powerpoint text-warning', '.ppt': 'fa-file-powerpoint text-warning', 
                '.xlsx': 'fa-file-excel text-success', '.xls': 'fa-file-excel text-success'
            }[ext] || 'fa-file';
            
            const fileType = {
                '.docx': 'Word Document', '.doc': 'Word Document',
                '.pptx': 'PowerPoint Presentation', '.ppt': 'PowerPoint Presentation', 
                '.xlsx': 'Excel Spreadsheet', '.xls': 'Excel Spreadsheet'
            }[ext] || 'Office Document';
            
            res.send(`
                <div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6><i class="fas ${iconClass}"></i> ${filename}</h6>
                        <div>
                            <span class="text-muted me-3">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</span>
                            <div class="btn-group me-2">
                                <button class="btn btn-sm btn-outline-primary active" onclick="viewWithOfficeOnline()">
                                    <i class="fas fa-cloud"></i> Office Online
                                </button>
                                <button class="btn btn-sm btn-outline-success" onclick="viewWithGoogleDocs()">
                                    <i class="fab fa-google"></i> Google Docs
                                </button>
                                <button class="btn btn-sm btn-outline-warning" onclick="showFileInfo()">
                                    <i class="fas fa-info-circle"></i> Thông tin File
                                </button>
                            </div>
                            <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-sm btn-primary" download>
                                <i class="fas fa-download"></i> Tải xuống
                            </a>
                        </div>
                    </div>
                    <div class="alert alert-info mb-3">
                        <div class="d-flex align-items-center">
                            <i class="fas ${iconClass} fa-2x me-3"></i>
                            <div>
                                <strong>${fileType}</strong>
                                <p class="mb-0 small">Sử dụng Office Online hoặc Google Docs để xem file. Nếu không hiển thị được, hãy tải xuống.</p>
                            </div>
                        </div>
                    </div>
                    <div id="officeViewer" style="height: 70vh; border: 1px solid #dee2e6; border-radius: 5px; position: relative;">
                        <div id="loadingIndicator" class="d-flex justify-content-center align-items-center h-100">
                            <div class="text-center">
                                <div class="spinner-border text-primary mb-3" role="status"></div>
                                <p class="text-muted">Đang tải preview...</p>
                            </div>
                        </div>
                        <iframe id="officeFrame" 
                                style="width: 100%; height: 100%; border: none; display: none;"
                                onload="hideLoading()">
                        </iframe>
                        <div id="fileInfo" style="display: none; padding: 20px;" class="h-100 overflow-auto">
                            <div class="text-center">
                                <i class="fas ${iconClass} fa-5x mb-3"></i>
                                <h4>${filename}</h4>
                                <div class="row justify-content-center">
                                    <div class="col-md-6">
                                        <table class="table table-bordered">
                                            <tr><td><strong>Loại file:</strong></td><td>${fileType}</td></tr>
                                            <tr><td><strong>Phần mở rộng:</strong></td><td>${ext.toUpperCase()}</td></tr>
                                            <tr><td><strong>Kích thước:</strong></td><td>${(attachment.file_size / 1024).toFixed(2)} KB</td></tr>
                                        </table>
                                        <div class="mt-4">
                                            <p class="text-muted">File này cần được tải xuống để xem đầy đủ nội dung.</p>
                                            <a href="${officeUrl}" class="btn btn-primary btn-lg">
                                                <i class="fas fa-download"></i> Tải xuống ngay
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <script>
                        const fullOfficeUrl = window.location.origin + '${officeUrl}';
                        
                        function hideLoading() {
                            document.getElementById('loadingIndicator').style.display = 'none';
                            document.getElementById('officeFrame').style.display = 'block';
                        }
                        
                        function showFileInfo() {
                            document.getElementById('officeFrame').style.display = 'none';
                            document.getElementById('loadingIndicator').style.display = 'none';
                            document.getElementById('fileInfo').style.display = 'block';
                            
                            // Update button states
                            document.querySelector('[onclick="viewWithOfficeOnline()"]').classList.remove('active');
                            document.querySelector('[onclick="viewWithGoogleDocs()"]').classList.remove('active');
                            document.querySelector('[onclick="showFileInfo()"]').classList.add('active');
                        }
                        
                        function viewWithOfficeOnline() {
                            document.getElementById('fileInfo').style.display = 'none';
                            document.getElementById('loadingIndicator').style.display = 'flex';
                            
                            const officeUrl = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(fullOfficeUrl);
                            document.getElementById('officeFrame').src = officeUrl;
                            
                            // Update button states
                            document.querySelector('[onclick="viewWithOfficeOnline()"]').classList.add('active');
                            document.querySelector('[onclick="viewWithGoogleDocs()"]').classList.remove('active');
                            document.querySelector('[onclick="showFileInfo()"]').classList.remove('active');
                        }
                        
                        function viewWithGoogleDocs() {
                            document.getElementById('fileInfo').style.display = 'none';
                            document.getElementById('loadingIndicator').style.display = 'flex';
                            
                            const googleUrl = 'https://docs.google.com/viewer?url=' + encodeURIComponent(fullOfficeUrl) + '&embedded=true';
                            document.getElementById('officeFrame').src = googleUrl;
                            
                            // Update button states  
                            document.querySelector('[onclick="viewWithOfficeOnline()"]').classList.remove('active');
                            document.querySelector('[onclick="viewWithGoogleDocs()"]').classList.add('active');
                            document.querySelector('[onclick="showFileInfo()"]').classList.remove('active');
                        }
                        
                        // Initialize with File Info view (safer default)
                        document.addEventListener('DOMContentLoaded', function() {
                            showFileInfo();
                        });
                    </script>
                </div>
            `);
        } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.flac'].includes(ext)) {
            console.log('Preview type: audio');
            // Audio preview with HTML5 player

            const audioUrl = `/download/${emailId}/${encodeURIComponent(filename)}`;
            
            // Determine MIME type for audio
            const mimeTypes = {
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.aac': 'audio/aac',
                '.wma': 'audio/x-ms-wma',
                '.flac': 'audio/flac'
            };
            
            const mimeType = mimeTypes[ext] || 'audio/mpeg';
            
            res.send(`
                <div class="text-center">
                    <div class="mb-4">
                        <h5><i class="fas fa-music text-primary"></i> ${filename}</h5>
                        <p class="text-muted">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</p>
                        <p class="text-muted small">Định dạng: ${ext.toUpperCase()} • MIME: ${mimeType}</p>
                    </div>
                    <audio controls style="width: 100%; max-width: 600px;" preload="metadata">
                        <source src="${audioUrl}" type="${mimeType}">
                        <source src="${audioUrl}" type="audio/mpeg">
                        <source src="${audioUrl}" type="audio/wav">
                        <source src="${audioUrl}" type="audio/ogg">
                        Trình duyệt của bạn không hỗ trợ phát audio này.
                    </audio>
                    <div class="mt-3">
                        <div class="alert alert-info small">
                            <i class="fas fa-info-circle"></i>
                            Nếu audio không phát được, hãy thử tải xuống và mở bằng trình phát nhạc khác.
                        </div>
                        <a href="${audioUrl}" class="btn btn-primary">
                            <i class="fas fa-download"></i> Tải xuống
                        </a>
                    </div>
                </div>
            `);
        } else if (['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.m4v'].includes(ext)) {
            console.log('Preview type: video');
            // Video preview - try different formats, fallback for unsupported
            const videoUrl = `/download/${emailId}/${encodeURIComponent(filename)}`;
            
            // Determine MIME type for video
            const mimeTypes = {
                '.mp4': 'video/mp4',
                '.webm': 'video/webm', 
                '.ogg': 'video/ogg',
                '.avi': 'video/x-msvideo',
                '.mov': 'video/quicktime',
                '.wmv': 'video/x-ms-wmv',
                '.flv': 'video/x-flv',
                '.mkv': 'video/x-matroska',
                '.m4v': 'video/mp4'
            };
            
            const mimeType = mimeTypes[ext] || 'video/mp4';
            
            res.send(`
                <div class="text-center">
                    <div class="mb-3">
                        <h5><i class="fas fa-video text-primary"></i> ${filename}</h5>
                        <p class="text-muted">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</p>
                        <p class="text-muted small">Định dạng: ${ext.toUpperCase()} • MIME: ${mimeType}</p>
                    </div>
                    <video controls style="width: 100%; max-width: 800px; max-height: 60vh;" preload="metadata">
                        <source src="${videoUrl}" type="${mimeType}">
                        <source src="${videoUrl}" type="video/mp4">
                        <source src="${videoUrl}" type="video/webm">
                        Trình duyệt của bạn không hỗ trợ phát video này.
                    </video>
                    <div class="mt-3">
                        <div class="alert alert-info small">
                            <i class="fas fa-info-circle"></i>
                            Nếu video không phát được, hãy thử tải xuống và mở bằng trình phát video khác.
                        </div>
                        <a href="${videoUrl}" class="btn btn-primary">
                            <i class="fas fa-download"></i> Tải xuống
                        </a>
                    </div>
                </div>
            `);
        } else if (['.txt', '.log', '.md', '.csv', '.json', '.xml'].includes(ext)) {
            console.log('Preview type: text');
            // Text file preview with proper formatting
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const displayContent = content.length > 50000 ? content.substring(0, 50000) + '\\n\\n... (Chỉ hiển thị 50KB đầu tiên)' : content;
                
                // Format based on file type
                let formattedContent = displayContent;
                if (ext === '.json') {
                    try {
                        formattedContent = JSON.stringify(JSON.parse(displayContent), null, 2);
                    } catch (e) {
                        // Keep original if not valid JSON
                    }
                }
                
                res.send(`
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6><i class="fas fa-file-alt text-primary"></i> ${filename}</h6>
                            <div>
                                <span class="text-muted me-3">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</span>
                                <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary">
                                    <i class="fas fa-download"></i> Tải xuống
                                </a>
                            </div>
                        </div>
                        <pre style="white-space: pre-wrap; word-wrap: break-word; max-height: 60vh; overflow-y: auto; background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 14px; line-height: 1.5;">${formattedContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    </div>
                `);
            } catch (error) {
                res.send(`
                    <div class="alert alert-warning">
                        <h6>${filename}</h6>
                        <p>Không thể đọc nội dung file text.</p>
                        <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary">
                            <i class="fas fa-download"></i> Tải xuống
                        </a>
                    </div>
                `);
            }
        } else if (['.html', '.htm'].includes(ext)) {
            console.log('Preview type: html');
            // HTML preview with toggle between rendered and source
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                res.send(`
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6><i class="fas fa-code text-warning"></i> ${filename}</h6>
                            <div>
                                <div class="btn-group me-3">
                                    <button class="btn btn-sm btn-outline-primary active" onclick="showRendered()">
                                        <i class="fas fa-eye"></i> Rendered
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" onclick="showSource()">
                                        <i class="fas fa-code"></i> Source
                                    </button>
                                </div>
                                <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-sm btn-primary">
                                    <i class="fas fa-download"></i> Tải xuống
                                </a>
                            </div>
                        </div>
                        <div id="htmlRendered" style="max-height: 65vh; overflow: auto; border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; background: white;">
                            ${content}
                        </div>
                        <div id="htmlSource" style="display: none; max-height: 65vh; overflow: auto;">
                            <pre style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px; white-space: pre-wrap; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 14px; line-height: 1.5;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                        </div>
                        <script>
                            function showRendered() {
                                document.getElementById('htmlRendered').style.display = 'block';
                                document.getElementById('htmlSource').style.display = 'none';
                                document.querySelector('[onclick="showRendered()"]').classList.add('active');
                                document.querySelector('[onclick="showSource()"]').classList.remove('active');
                            }
                            function showSource() {
                                document.getElementById('htmlRendered').style.display = 'none';
                                document.getElementById('htmlSource').style.display = 'block';
                                document.querySelector('[onclick="showRendered()"]').classList.remove('active');
                                document.querySelector('[onclick="showSource()"]').classList.add('active');
                            }
                        </script>
                    </div>
                `);
            } catch (error) {
                res.send(`
                    <div class="alert alert-warning">
                        <h6>${filename}</h6>
                        <p>Không thể đọc nội dung file HTML.</p>
                        <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary">
                            <i class="fas fa-download"></i> Tải xuống
                        </a>
                    </div>
                `);
            }
        } else if (['.css', '.js', '.py', '.php', '.java', '.cpp', '.c', '.ts', '.jsx'].includes(ext)) {
            console.log('Preview type: code');
            // Code file preview with syntax highlighting hint
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const displayContent = content.length > 50000 ? content.substring(0, 50000) + '\\n\\n... (Chỉ hiển thị 50KB đầu tiên)' : content;
                
                const languageMap = {
                    '.css': 'CSS', '.js': 'JavaScript', '.py': 'Python', '.php': 'PHP',
                    '.java': 'Java', '.cpp': 'C++', '.c': 'C', '.ts': 'TypeScript', '.jsx': 'React JSX'
                };
                const language = languageMap[ext] || 'Code';
                
                res.send(`
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6><i class="fas fa-code text-success"></i> ${filename} <span class="badge bg-secondary">${language}</span></h6>
                            <div>
                                <span class="text-muted me-3">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</span>
                                <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary">
                                    <i class="fas fa-download"></i> Tải xuống
                                </a>
                            </div>
                        </div>
                        <pre style="white-space: pre-wrap; word-wrap: break-word; max-height: 60vh; overflow-y: auto; background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 14px; line-height: 1.5;"><code>${displayContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                    </div>
                `);
            } catch (error) {
                res.send(`
                    <div class="alert alert-warning">
                        <h6>${filename}</h6>
                        <p>Không thể đọc nội dung file code.</p>
                        <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary">
                            <i class="fas fa-download"></i> Tải xuống
                        </a>
                    </div>
                `);
            }
        } else {
            console.log('Preview type: unsupported');
            // For files that cannot be previewed on web
            res.send(`
                <div class="text-center">
                    <div class="mb-4">
                        <i class="fas fa-file fa-5x text-muted"></i>
                    </div>
                    <h5>${filename}</h5>
                    <p class="text-muted">Kích thước: ${(attachment.file_size / 1024).toFixed(2)} KB</p>
                    <div class="alert alert-info">
                        <p><i class="fas fa-info-circle"></i> File này không thể xem trước trên trình duyệt</p>
                        <p>Vui lòng tải xuống để xem nội dung</p>
                    </div>
                    <a href="/download/${emailId}/${encodeURIComponent(filename)}" class="btn btn-primary btn-lg">
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
        const decodedFilename = decodeURIComponent(filename);
        console.log(`🔍 Looking for download attachment: emailId=${emailId}, filename=${decodedFilename}`);
        
        const attachment = await new Promise((resolve, reject) => {
            db.get(`
                SELECT * FROM attachments 
                WHERE email_id = ? AND (filename = ? OR ? LIKE '%' || filename || '%' OR filename LIKE '%' || ? || '%')
            `, [emailId, decodedFilename, decodedFilename, decodedFilename], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        console.log(`📥 Download request: emailId=${emailId}, filename=${filename}`);
        console.log(`🔍 Found attachment:`, attachment ? JSON.stringify(attachment) : 'Not found');

        if (!attachment) {
            console.log(`❌ Download failed: Attachment not found for emailId=${emailId}, filename=${filename}`);
            return res.status(404).send('File không tồn tại');
        }

        const filePath = path.resolve(__dirname, '..', attachment.file_path);
        console.log(`📁 Resolved file path: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.log(`❌ Download failed: File not found at path: ${filePath}`);
            return res.status(404).send('File không tìm thấy trên hệ thống');
        }
        
        console.log(`✅ File exists and ready for download: ${attachment.filename}`);
        console.log(`📤 Sending file with size: ${fs.statSync(filePath).size} bytes`);

        // Get file extension to set appropriate content type
        const ext = path.extname(attachment.filename).toLowerCase();
        
        // For preview requests (when not explicitly downloading), set inline disposition for certain file types
        const isPreviewRequest = req.query.preview === 'true' || req.headers.referer?.includes('/preview/');
        
        if (isPreviewRequest && ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext)) {
            // Set content type for inline viewing
            const contentTypes = {
                '.pdf': 'application/pdf',
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.gif': 'image/gif',
                '.svg': 'image/svg+xml', '.webp': 'image/webp'
            };
            
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
            // Use RFC 5987 encoding for non-ASCII characters
            const safeName = Buffer.from(attachment.filename, 'utf8').toString('ascii', {stream: false}).replace(/[^\x20-\x7e]/g, '?');
            const encodedName = encodeURIComponent(attachment.filename);
            res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
        } else {
            // Set appropriate headers for download with proper encoding
            const safeName = Buffer.from(attachment.filename, 'utf8').toString('ascii', {stream: false}).replace(/[^\x20-\x7e]/g, '?');
            const encodedName = encodeURIComponent(attachment.filename);
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
            res.setHeader('Content-Type', 'application/octet-stream');
        }
        
        // Send file
        console.log(`📤 About to send file: ${filePath}`);
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error(`❌ sendFile error: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).send('Lỗi khi gửi file');
                }
            } else {
                console.log(`✅ File sent successfully: ${attachment.filename}`);
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Lỗi khi tải file');
    }
});

// Gmail Authentication Routes
const gmailService = require('../services/gmailService');

// Route để bắt đầu Gmail authorization
router.get('/auth/gmail', requireAuth, (req, res) => {
    try {
        console.log('🔄 Starting Gmail authorization...');
        const authUrl = gmailService.getAuthUrl();
        console.log('📧 Gmail Auth URL:', authUrl);
        
        res.json({ 
            success: true, 
            message: 'Please visit the URL to authorize Gmail access',
            authUrl: authUrl
        });
    } catch (error) {
        console.error('Gmail auth start error:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi bắt đầu Gmail authentication' });
    }
});

// Callback route cho Gmail OAuth
router.get('/auth/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('Missing authorization code');
        }

        console.log('🔄 Processing Gmail authorization callback...');
        await gmailService.authorizeCallback(code);
        
        res.send(`
            <html>
                <body>
                    <h2>✅ Gmail Authorization Successful!</h2>
                    <p>You can now close this window and return to the TeamSync Hub app.</p>
                    <script>window.close();</script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Gmail auth callback error:', error);
        res.status(500).send('Gmail authorization failed: ' + error.message);
    }
});

// API để reset database
router.post('/reset-database', requireAuth, async (req, res) => {
    try {
        await emailService.resetDatabase();
        res.json({ success: true, message: 'Database đã được reset thành công' });
    } catch (error) {
        console.error('Error resetting database:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi reset database' });
    }
});

// Test route để hiển thị Gmail auth URL
router.get('/test-gmail-auth', (req, res) => {
    try {
        const authUrl = gmailService.getAuthUrl();
        res.send(`
            <html>
                <head>
                    <title>Gmail Authorization</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        .url-box { 
                            background: #f5f5f5; 
                            padding: 15px; 
                            border-radius: 5px; 
                            word-break: break-all;
                            margin: 10px 0;
                        }
                        .btn { 
                            background: #4285f4; 
                            color: white; 
                            padding: 10px 20px; 
                            text-decoration: none; 
                            border-radius: 5px; 
                            display: inline-block;
                            margin: 10px 0;
                        }
                    </style>
                </head>
                <body>
                    <h2>🔐 Gmail Authorization Required</h2>
                    <p>Click the button below to authorize Gmail access:</p>
                    
                    <a href="${authUrl}" target="_blank" class="btn">
                        🚀 Authorize Gmail Access
                    </a>
                    
                    <h3>Or copy this URL:</h3>
                    <div class="url-box">
                        ${authUrl}
                    </div>
                    
                    <p><strong>Instructions:</strong></p>
                    <ol>
                        <li>Click the link above or copy the URL</li>
                        <li>Sign in with your Gmail account</li>
                        <li>Grant permissions to the app</li>
                        <li>You'll be redirected back to the app</li>
                        <li>After authorization, try syncing emails again</li>
                    </ol>
                </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Error generating auth URL: ' + error.message);
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

        const result = await TaskService.assignTask(emailId, employeeId, managerId, 'in_progress');
        res.json({ success: true, message: 'Giao nhiệm vụ thành công', data: result });
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

        const result = await TaskService.completeTask(emailId, userId);
        res.json({ success: true, message: 'Hoàn thành nhiệm vụ thành công', data: result });
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi hoàn thành nhiệm vụ' });
    }
});

// API: Hủy giao nhiệm vụ
router.post('/unassign-task', requireAuth, authorizeManager, async (req, res) => {
    try {
        const { emailId } = req.body;
        const userId = req.user.id;

        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email' });
        }

        const result = await TaskService.unassignTask(emailId, userId);
        res.json({ success: true, message: 'Đã hủy giao nhiệm vụ', data: result });
    } catch (error) {
        console.error('Error unassigning task:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi hủy giao nhiệm vụ' });
    }
});

// API: Thêm thảo luận
router.post('/add-discussion', requireAuth, async (req, res) => {
    try {
        const { emailId, message } = req.body;
        const userId = req.user.id;
        const userName = req.user.name;

        if (!emailId || !message) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email hoặc nội dung thảo luận' });
        }

        const result = await DiscussionService.addDiscussion(emailId, userId, userName, message);
        res.json({ success: true, message: 'Thêm thảo luận thành công', data: result });
    } catch (error) {
        console.error('Error adding discussion:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi thêm thảo luận' });
    }
});

// API: Xóa thảo luận
router.post('/delete-discussion', requireAuth, async (req, res) => {
    try {
        const { discussionId } = req.body;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'Manager';

        if (!discussionId) {
            return res.status(400).json({ success: false, message: 'Thiếu ID thảo luận' });
        }

        const result = await DiscussionService.deleteDiscussion(discussionId, userId, isAdmin);
        res.json({ success: true, message: 'Xóa thảo luận thành công', data: result });
    } catch (error) {
        console.error('Error deleting discussion:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi xóa thảo luận' });
    }
});

// API: Cập nhật thảo luận
router.post('/update-discussion', requireAuth, async (req, res) => {
    try {
        const { discussionId, message } = req.body;
        const userId = req.user.id;

        if (!discussionId || !message) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin cần thiết' });
        }

        const result = await DiscussionService.updateDiscussion(discussionId, userId, message);
        res.json({ success: true, message: 'Cập nhật thảo luận thành công', data: result });
    } catch (error) {
        console.error('Error updating discussion:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thảo luận' });
    }
});

// API: Cập nhật trạng thái task (cho admin)
router.post('/update-task-status', requireAuth, authorizeManager, async (req, res) => {
    try {
        const { emailId, status, assignedUserId } = req.body;
        const adminId = req.user.id;

        if (!emailId || !status) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin email hoặc trạng thái' });
        }

        const result = await TaskService.adminChangeTaskStatus(emailId, status, adminId, assignedUserId);
        res.json({ success: true, message: 'Cập nhật trạng thái thành công', data: result });
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({ success: false, message: 'Có lỗi xảy ra khi cập nhật trạng thái' });
    }
});

module.exports = router;
