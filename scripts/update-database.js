const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Kết nối đến database
const dbPath = path.join(__dirname, '..', 'email_manager.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Updating database schema...');

// Tạo bảng emails mới với schema đơn giản
db.serialize(() => {
    // Backup dữ liệu cũ
    console.log('📦 Creating backup of existing data...');
    db.run(`CREATE TABLE IF NOT EXISTS emails_backup AS SELECT * FROM emails`);
    
    // Xóa bảng cũ
    console.log('🗑️ Dropping old emails table...');
    db.run(`DROP TABLE IF EXISTS emails`);
    
    // Tạo bảng mới với schema đơn giản
    console.log('🆕 Creating new emails table...');
    db.run(`
        CREATE TABLE emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE,
            sender TEXT,
            recipient TEXT,
            subject TEXT,
            body_content TEXT,
            body_preview TEXT,
            received_datetime TEXT,
            sent_datetime TEXT,
            is_read INTEGER DEFAULT 0,
            email_type TEXT, -- 'incoming' hoặc 'outgoing'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Migrate dữ liệu từ backup (chỉ lấy các cột cần thiết)
    console.log('📊 Migrating data from backup...');
    db.run(`
        INSERT INTO emails (
            message_id, sender, recipient, subject, body_content, body_preview,
            received_datetime, sent_datetime, is_read, email_type, created_at
        )
        SELECT 
            message_id, sender, recipient, subject, body_content, body_preview,
            received_datetime, sent_datetime, is_read, email_type, created_at
        FROM emails_backup
    `);
    
    // Xóa bảng backup
    console.log('🧹 Cleaning up backup table...');
    db.run(`DROP TABLE emails_backup`);
    
    console.log('✅ Database update completed successfully!');
    
    // Hiển thị thống kê
    db.get('SELECT COUNT(*) as count FROM emails', (err, row) => {
        if (err) {
            console.error('❌ Error counting emails:', err);
        } else {
            console.log(`📧 Total emails in database: ${row.count}`);
        }
        db.close();
    });
});
