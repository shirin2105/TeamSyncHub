const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'email_manager.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeTables();
    }
});

function initializeTables() {
    // Bảng users cho authentication (tạo trước)
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            provider TEXT NOT NULL, -- 'google' hoặc 'microsoft'
            provider_id TEXT NOT NULL,
            avatar_url TEXT,
            role TEXT DEFAULT 'Employee', -- 'Manager', 'Employee'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active INTEGER DEFAULT 1
        )
    `, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        } else {
            console.log('Users table created successfully.');
            
            // Set specific user as Manager after table is created
            db.run(`
                INSERT OR IGNORE INTO users (email, name, provider, provider_id, role) 
                VALUES ('trandangbach2005@gmail.com', 'Manager', 'google', 'default', 'Manager')
            `, (err) => {
                if (err) {
                    console.error('Error inserting manager user:', err.message);
                } else {
                    // Update existing user to Manager
                    db.run(`
                        UPDATE users SET role = 'Manager' 
                        WHERE email = 'trandangbach2005@gmail.com'
                    `);
                }
            });
        }
    });

    // Bảng emails
    db.run(`
        CREATE TABLE IF NOT EXISTS emails (
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
            assigned_to_id INTEGER, -- ID của user được giao task
            assigned_to_name TEXT, -- Tên user được giao task
            assigned_by_id INTEGER, -- ID của user giao task
            assigned_by_name TEXT, -- Tên user giao task
            assigned_at DATETIME, -- Thời gian giao task
            task_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assigned_to_id) REFERENCES users (id),
            FOREIGN KEY (assigned_by_id) REFERENCES users (id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating emails table:', err.message);
        } else {
            console.log('Emails table created successfully.');
            
            // Thêm các cột task assignment mới nếu chưa có
            db.run(`ALTER TABLE emails ADD COLUMN assigned_to_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding assigned_to_id column:', err.message);
                } else if (!err) {
                    console.log('Added assigned_to_id column to emails table.');
                }
            });
            
            db.run(`ALTER TABLE emails ADD COLUMN assigned_to_name TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding assigned_to_name column:', err.message);
                } else if (!err) {
                    console.log('Added assigned_to_name column to emails table.');
                }
            });
            
            db.run(`ALTER TABLE emails ADD COLUMN assigned_by_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding assigned_by_id column:', err.message);
                } else if (!err) {
                    console.log('Added assigned_by_id column to emails table.');
                }
            });
            
            db.run(`ALTER TABLE emails ADD COLUMN assigned_by_name TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding assigned_by_name column:', err.message);
                } else if (!err) {
                    console.log('Added assigned_by_name column to emails table.');
                }
            });
        }
    });

    // Bảng attachments
    db.run(`
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_id INTEGER,
            filename TEXT,
            original_filename TEXT,
            file_path TEXT,
            file_size INTEGER,
            content_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (email_id) REFERENCES emails (id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating attachments table:', err.message);
        } else {
            console.log('Attachments table created successfully.');
            
            // Thêm cột original_filename nếu chưa có
            db.run(`ALTER TABLE attachments ADD COLUMN original_filename TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding original_filename column:', err.message);
                } else if (!err) {
                    console.log('Added original_filename column to attachments table.');
                }
            });
        }
    });

    // Bảng discussions cho thảo luận nội bộ
    db.run(`
        CREATE TABLE IF NOT EXISTS discussions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (email_id) REFERENCES emails (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating discussions table:', err.message);
        } else {
            console.log('Discussions table created successfully.');
        }
    });

    console.log('Database tables initialized.');
}

module.exports = db;
