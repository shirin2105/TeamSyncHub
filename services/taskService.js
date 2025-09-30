const db = require('../config/database');

class TaskService {
    // Giao task cho user
    static assignTask(emailId, assignedToUserId, assignedByUserId, status = 'pending') {
        return new Promise((resolve, reject) => {
            // Lấy thông tin user được giao nhiệm vụ
            db.get('SELECT name FROM users WHERE id = ?', [assignedToUserId], (err, assignedUser) => {
                if (err) return reject(err);
                if (!assignedUser) return reject(new Error('User không tồn tại'));
                
                // Lấy thông tin user giao nhiệm vụ
                db.get('SELECT name FROM users WHERE id = ?', [assignedByUserId], (err, assignerUser) => {
                    if (err) return reject(err);
                    if (!assignerUser) return reject(new Error('User không tồn tại'));
                    
                    const query = `
                        UPDATE emails 
                        SET assigned_to_id = ?, assigned_to_name = ?, 
                            assigned_by_id = ?, assigned_by_name = ?, 
                            assigned_at = CURRENT_TIMESTAMP, task_status = ?
                        WHERE id = ?
                    `;
                    
                    db.run(query, [
                        assignedToUserId, 
                        assignedUser.name,
                        assignedByUserId,
                        assignerUser.name,
                        status, 
                        emailId
                    ], function(err) {
                        if (err) {
                            console.error('Error assigning task:', err);
                            reject(err);
                        } else {
                            resolve({ 
                                emailId,
                                assignedTo: assignedToUserId,
                                assignedToName: assignedUser.name,
                                assignedBy: assignedByUserId,
                                assignedByName: assignerUser.name,
                                status,
                                updated: this.changes > 0 
                            });
                        }
                    });
                });
            });
        });
    }

    // Cập nhật trạng thái task
    static updateTaskStatus(emailId, newStatus, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE emails 
                SET task_status = ?
                WHERE id = ? AND assigned_to_id = ?
            `;
            
            db.run(query, [newStatus, emailId, userId], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('Task not found or no permission to update'));
                } else {
                    resolve({ updated: true, status: newStatus });
                }
            });
        });
    }

    // Admin change task status with special logic
    static adminChangeTaskStatus(emailId, newStatus, adminId, assignedUserId = null) {
        return new Promise((resolve, reject) => {
            console.log(`🔄 Admin changing task status for email ${emailId} to ${newStatus}`);
            
            // Validate status
            const validStatuses = ['pending', 'in_progress', 'completed'];
            if (!validStatuses.includes(newStatus)) {
                return reject(new Error('Invalid task status'));
            }
            
            // Special logic for in_progress - must assign to someone
            if (newStatus === 'in_progress') {
                if (!assignedUserId) {
                    return reject(new Error('Task must be assigned to someone when setting to in_progress'));
                }
                
                // Verify assigned user exists
                db.get('SELECT id, name FROM users WHERE id = ?', [assignedUserId], (err, user) => {
                    if (err) return reject(err);
                    if (!user) return reject(new Error('Assigned user not found'));
                    
                    // Update with assignment
                    const query = `
                        UPDATE emails 
                        SET task_status = ?, assigned_to_id = ?, assigned_to_name = ?, 
                            assigned_by_id = ?, assigned_by_name = 'Admin', 
                            assigned_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `;
                    
                    db.run(query, [newStatus, assignedUserId, user.name, adminId, emailId], function(err) {
                        if (err) {
                            reject(err);
                        } else if (this.changes === 0) {
                            reject(new Error('Email not found'));
                        } else {
                            console.log(`✅ Task set to in_progress and assigned to user ${assignedUserId}`);
                            resolve({ 
                                updated: true, 
                                status: newStatus, 
                                assignedTo: assignedUserId,
                                assignedToName: user.name
                            });
                        }
                    });
                });
            } 
            // Special logic for pending - remove assignment
            else if (newStatus === 'pending') {
                const query = `
                    UPDATE emails 
                    SET task_status = ?, assigned_to_id = NULL, assigned_to_name = NULL, 
                        assigned_by_id = NULL, assigned_by_name = NULL, assigned_at = NULL
                    WHERE id = ?
                `;
                
                db.run(query, [newStatus, emailId], function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('Email not found'));
                    } else {
                        console.log(`✅ Task set to pending and assignment removed`);
                        resolve({ 
                            updated: true, 
                            status: newStatus,
                            unassigned: true
                        });
                    }
                });
            }
            // For completed - just update status
            else if (newStatus === 'completed') {
                const query = `
                    UPDATE emails 
                    SET task_status = ?
                    WHERE id = ?
                `;
                
                db.run(query, [newStatus, emailId], function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('Email not found'));
                    } else {
                        console.log(`✅ Task marked as completed`);
                        resolve({ 
                            updated: true, 
                            status: newStatus
                        });
                    }
                });
            }
        });
    }

    // Employee complete their assigned task
    static completeTask(emailId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE emails 
                SET task_status = 'completed'
                WHERE id = ? AND assigned_to_id = ?
            `;
            
            db.run(query, [emailId, userId], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('Task not found or no permission to update'));
                } else {
                    resolve({ updated: true, status: 'completed' });
                }
            });
        });
    }

    // Get all emails with tasks
    static getEmailsWithTasks() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT e.id, e.subject, e.sender, e.task_status, 
                       e.assigned_to_id, e.assigned_to_name, e.assigned_at,
                       u.name as user_name, u.email as user_email
                FROM emails e
                LEFT JOIN users u ON e.assigned_to_id = u.id
                WHERE e.assigned_to_id IS NOT NULL
                ORDER BY e.assigned_at DESC
            `;
            
            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get tasks assigned to user
    static getTasksByUser(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT e.id, e.subject, e.sender, e.task_status, e.assigned_at
                FROM emails e
                WHERE e.assigned_to_id = ?
                ORDER BY 
                    CASE e.task_status 
                        WHEN 'in_progress' THEN 1 
                        WHEN 'pending' THEN 2 
                        ELSE 3 
                    END,
                    e.assigned_at DESC
            `;
            
            db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Unassign task
    static unassignTask(emailId, userId) {
        return new Promise((resolve, reject) => {
            // First check if user has permission to unassign
            db.get(`
                SELECT e.* FROM emails e
                WHERE e.id = ? AND (e.assigned_by_id = ? OR ? = (SELECT id FROM users WHERE role = 'Manager' AND id = ?))
            `, [emailId, userId, userId, userId], (err, email) => {
                if (err) {
                    return reject(err);
                }
                
                if (!email) {
                    return reject(new Error('Email not found or no permission to unassign'));
                }
                
                // User has permission, proceed with unassignment
                const query = `
                    UPDATE emails 
                    SET assigned_to_id = NULL, assigned_to_name = NULL,
                        assigned_by_id = NULL, assigned_by_name = NULL,
                        assigned_at = NULL, task_status = 'pending'
                    WHERE id = ?
                `;
                
                db.run(query, [emailId], function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('Failed to unassign task'));
                    } else {
                        resolve({ unassigned: true });
                    }
                });
            });
        });
    }
}

module.exports = TaskService;