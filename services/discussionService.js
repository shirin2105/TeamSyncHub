const db = require('../config/database');

class DiscussionService {
    // Lấy tất cả discussions cho một email
    static getDiscussionsByEmailId(emailId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT d.*, u.email as user_email, u.avatar_url
                FROM discussions d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.email_id = ?
                ORDER BY d.created_at ASC
            `;
            
            db.all(query, [emailId], (err, rows) => {
                if (err) {
                    console.error('Error getting discussions:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // Thêm discussion mới
    static addDiscussion(emailId, userId, userName, message) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO discussions (email_id, user_id, user_name, message)
                VALUES (?, ?, ?, ?)
            `;
            
            db.run(query, [emailId, userId, userName, message], function(err) {
                if (err) {
                    console.error('Error adding discussion:', err);
                    reject(err);
                } else {
                    // Lấy discussion vừa tạo với thông tin user
                    const getQuery = `
                        SELECT d.*, u.email as user_email, u.avatar_url
                        FROM discussions d
                        LEFT JOIN users u ON d.user_id = u.id
                        WHERE d.id = ?
                    `;
                    
                    db.get(getQuery, [this.lastID], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row);
                        }
                    });
                }
            });
        });
    }

    // Xóa discussion (chỉ chủ sở hữu hoặc admin)
    static deleteDiscussion(discussionId, userId, isAdmin = false) {
        return new Promise((resolve, reject) => {
            // Kiểm tra quyền sở hữu trước khi xóa
            let checkQuery = 'SELECT user_id FROM discussions WHERE id = ?';
            let checkParams = [discussionId];
            
            if (!isAdmin) {
                checkQuery += ' AND user_id = ?';
                checkParams.push(userId);
            }
            
            db.get(checkQuery, checkParams, (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    reject(new Error('Discussion not found or no permission to delete'));
                } else {
                    // Thực hiện xóa
                    db.run('DELETE FROM discussions WHERE id = ?', [discussionId], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ deleted: this.changes > 0 });
                        }
                    });
                }
            });
        });
    }

    // Cập nhật discussion (chỉ chủ sở hữu)
    static updateDiscussion(discussionId, userId, newMessage) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE discussions 
                SET message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `;
            
            db.run(query, [newMessage, discussionId, userId], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('Discussion not found or no permission to update'));
                } else {
                    resolve({ updated: true });
                }
            });
        });
    }

    // Đếm số discussions cho một email
    static getDiscussionCount(emailId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT COUNT(*) as count FROM discussions WHERE email_id = ?';
            
            db.get(query, [emailId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count || 0);
                }
            });
        });
    }
}

module.exports = DiscussionService;
