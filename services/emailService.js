const db = require('../config/database');
const gmailService = require('./gmailService');
const sendgridService = require('./sendgridService');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class EmailService {
    constructor() {
        this.attachmentBasePath = path.join(__dirname, '..', 'attachments');
    }

    async saveEmailToDatabase(email, emailType = 'incoming') {
        return new Promise((resolve, reject) => {
            // Lấy nội dung email
            let bodyContent = email.body?.content || '';
            
            // Ưu tiên uniqueBody (text version) nếu có
            if (email.uniqueBody && email.uniqueBody.content) {
                console.log('📄 Using uniqueBody (text version)');
                bodyContent = email.uniqueBody.content;
            } else {
                console.log('📄 Using body (HTML version)');
            }
            
            console.log('=== DEBUG EMAIL PROCESSING ===');
            console.log('Email subject:', email.subject);
            console.log('Email body content:', bodyContent?.substring(0, 200) + '...');
            console.log('==============================');
            
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO emails (
                    message_id, sender, recipient, subject, body_content, body_preview,
                    received_datetime, sent_datetime, is_read, email_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const sender = emailType === 'incoming' ? 
                (email.from?.emailAddress?.address || '') : 
                (process.env.FROM_EMAIL || 'your-email@yourdomain.com');
            
            const recipient = emailType === 'incoming' ? 
                (process.env.FROM_EMAIL || 'your-email@yourdomain.com') : 
                (email.toRecipients?.[0]?.emailAddress?.address || '');

            stmt.run([
                email.id,
                sender,
                recipient,
                email.subject || '',
                bodyContent || '',
                email.bodyPreview || '',
                email.receivedDateTime || null,
                email.sentDateTime || null,
                email.isRead ? 1 : 0,
                emailType
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async saveAttachment(emailId, attachment, emailType = 'incoming') {
        const date = moment();
        const folderStructure = date.format('YYYY/MM/DD');
        const timeStamp = date.format('HHmmss');
        
        const attachmentDir = path.join(
            this.attachmentBasePath,
            emailType,
            folderStructure
        );

        await fs.ensureDir(attachmentDir);

        const fileName = `${path.parse(attachment.name).name}_${timeStamp}${path.parse(attachment.name).ext}`;
        const filePath = path.join(attachmentDir, fileName);

        // Lưu file attachment
        if (attachment.contentBytes) {
            console.log(`💾 Saving attachment "${attachment.name}" with content (${attachment.size} bytes)`);
            const buffer = Buffer.from(attachment.contentBytes, 'base64');
            await fs.writeFile(filePath, buffer);
            console.log(`✅ File saved to: ${filePath}`);
        } else {
            console.error(`❌ No contentBytes for attachment: ${attachment.name}`);
            throw new Error(`Attachment "${attachment.name}" has no content data`);
        }

        // Lưu thông tin attachment vào database
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO attachments (email_id, filename, file_path, file_size, content_type)
                VALUES (?, ?, ?, ?, ?)
            `);

            stmt.run([
                emailId,
                fileName,  // Tên file đã thêm timestamp
                filePath,
                attachment.size || 0,
                attachment.contentType || 'application/octet-stream'
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async processNewEmails() {
        try {
            console.log('Checking for new emails...');
            
            // Get the latest email datetime from database
            const latestDateTime = await this.getLatestEmailDateTime();
            let newEmailsCount = 0;
            
            if (latestDateTime) {
                console.log(`📅 Latest email in database: ${latestDateTime}`);
                console.log('🔍 Checking only for emails newer than latest database entry...');
            } else {
                console.log('📭 No emails in database, checking all emails...');
            }
            
            const messages = await gmailService.getMessages(50);
            
            for (const message of messages) {
                // If we have a latest datetime, skip emails that are older or equal
                if (latestDateTime) {
                    const messageDateTime = message.receivedDateTime;
                    if (messageDateTime <= latestDateTime) {
                        console.log(`⏭️  Skipping email "${message.subject}" (${messageDateTime}) - older than latest (${latestDateTime})`);
                        continue; // Skip this email and continue with next
                    }
                }
                
                // Kiểm tra xem email đã tồn tại chưa (double check)
                const existingEmail = await this.getEmailByMessageId(message.id);
                
                if (!existingEmail) {
                    console.log(`Processing new email: ${message.subject}`);
                    newEmailsCount++;
                    
                    try {
                        // Lưu email vào database
                        const emailId = await this.saveEmailToDatabase(message, 'incoming');
                        console.log(`✅ Saved incoming email: ${message.subject}`);
                        
                        // Xử lý attachments - cần download riêng từ Graph API
                        if (message.hasAttachments && message.attachments) {
                            console.log(`📎 Processing ${message.attachments.length} attachments for email: ${message.subject}`);
                            for (const attachment of message.attachments) {
                                if (attachment['@odata.type'] === '#microsoft.graph.fileAttachment') {
                                    try {
                                        console.log(`📥 Downloading attachment: ${attachment.name}`);
                                        // Tải attachment content từ Gmail API
                                        const fullAttachment = await gmailService.downloadAttachment(message.id, attachment.id);
                                        console.log(`✅ Downloaded attachment: ${attachment.name}, size: ${fullAttachment.size || 0} bytes`);
                                        
                                        // Lưu attachment với content đầy đủ
                                        await this.saveAttachment(emailId, fullAttachment, 'incoming');
                                        console.log(`💾 Saved attachment: ${attachment.name}`);
                                    } catch (attachmentError) {
                                        console.error(`❌ Error downloading/saving attachment "${attachment.name}":`, attachmentError);
                                    }
                                } else {
                                    console.log(`⏭️  Skipping attachment type: ${attachment['@odata.type']}`);
                                }
                            }
                        } else if (message.hasAttachments) {
                            console.log(`⚠️  Email "${message.subject}" has attachments but attachments array is empty or null`);
                        }
                    } catch (saveError) {
                        console.error(`❌ Error saving incoming email "${message.subject}":`, saveError);
                    }
                } else {
                    console.log(`⏭️  Email "${message.subject}" already exists in database`);
                }
            }
            
            if (newEmailsCount > 0) {
                console.log(`📧 Email check completed. Found ${newEmailsCount} new emails.`);
            } else {
                console.log('📭 Email check completed. No new emails found.');
            }
        } catch (error) {
            console.error('Error processing emails:', error);
        }
    }

    async getEmailByMessageId(messageId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM emails WHERE message_id = ?', [messageId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Get the latest email from database to use as starting point for new checks
    async getLatestEmailDateTime() {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT received_datetime, sent_datetime 
                FROM emails 
                WHERE email_type = 'incoming'
                ORDER BY received_datetime DESC 
                LIMIT 1
            `, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    // Return the latest datetime or null if no emails exist
                    resolve(row ? row.received_datetime : null);
                }
            });
        });
    }

    // Get the latest sent email datetime
    async getLatestSentEmailDateTime() {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT sent_datetime 
                FROM emails 
                WHERE email_type = 'outgoing'
                ORDER BY sent_datetime DESC 
                LIMIT 1
            `, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    // Return the latest datetime or null if no emails exist
                    resolve(row ? row.sent_datetime : null);
                }
            });
        });
    }

    async getAllEmails(limit = 100) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM emails 
                ORDER BY received_datetime DESC, sent_datetime DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getAllEmailsWithAttachments(limit = 100) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT e.*, 
                       COUNT(a.id) as attachment_count
                FROM emails e 
                LEFT JOIN attachments a ON e.id = a.email_id 
                WHERE e.email_type = 'incoming' OR e.email_type IS NULL
                GROUP BY e.id
                ORDER BY e.received_datetime DESC, e.sent_datetime DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getSentEmailsWithAttachments(limit = 100) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT e.*, 
                       COUNT(a.id) as attachment_count
                FROM emails e 
                LEFT JOIN attachments a ON e.id = a.email_id 
                WHERE e.email_type = 'outgoing'
                GROUP BY e.id
                ORDER BY e.sent_datetime DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getEmailById(emailId) {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT e.*
                FROM emails e 
                WHERE e.id = ?
            `, [emailId], async (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    // Get attachments for this email
                    db.all(`
                        SELECT * FROM attachments WHERE email_id = ?
                    `, [emailId], (err, attachments) => {
                        if (err) {
                            reject(err);
                        } else {
                            row.attachments = attachments || [];
                            resolve(row);
                        }
                    });
                }
            });
        });
    }

    async getSentEmails(limit = 100) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT e.*, 
                       COUNT(a.id) as attachment_count
                FROM emails e 
                LEFT JOIN attachments a ON e.id = a.email_id 
                WHERE e.email_type = 'outgoing'
                GROUP BY e.id
                ORDER BY e.sent_datetime DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async resetDatabase() {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('DELETE FROM attachments', (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });
                
                db.run('DELETE FROM emails', (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Reset auto increment
                    db.run('DELETE FROM sqlite_sequence WHERE name="emails"', (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                    });
                    
                    db.run('DELETE FROM sqlite_sequence WHERE name="attachments"', (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        console.log('Database reset completed successfully');
                        resolve();
                    });
                });
            });
        });
    }

    async getEmailWithAttachments(emailId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM emails WHERE id = ?', [emailId], (err, email) => {
                if (err) {
                    reject(err);
                } else if (!email) {
                    resolve(null);
                } else {
                    db.all('SELECT * FROM attachments WHERE email_id = ?', [emailId], (err, attachments) => {
                        if (err) {
                            reject(err);
                        } else {
                            email.attachments = attachments;
                            resolve(email);
                        }
                    });
                }
            });
        });
    }

    async syncSentEmails() {
        try {
            console.log('🔄 Syncing sent emails from Microsoft Graph...');
            
            // Get the latest sent email datetime from database
            const latestSentDateTime = await this.getLatestSentEmailDateTime();
            let newEmailsCount = 0;
            
            if (latestSentDateTime) {
                console.log(`📅 Latest sent email in database: ${latestSentDateTime}`);
                console.log('🔍 Checking only for sent emails newer than latest database entry...');
            } else {
                console.log('📭 No sent emails in database, checking all sent emails...');
            }
            
            const sentMessages = await gmailService.getSentMessages(100);
            
            for (const message of sentMessages) {
                // If we have a latest datetime, skip emails that are older or equal
                if (latestSentDateTime) {
                    const messageSentDateTime = message.sentDateTime;
                    if (messageSentDateTime <= latestSentDateTime) {
                        console.log(`⏭️  Skipping sent email "${message.subject}" (${messageSentDateTime}) - older than latest (${latestSentDateTime})`);
                        continue; // Skip this email and continue with next
                    }
                }
                
                try {
                    await this.saveEmailToDatabase(message, 'outgoing');
                    newEmailsCount++;
                    console.log(`✅ Saved sent email: ${message.subject || '(No subject)'}`);
                } catch (error) {
                    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                        // Email already exists, skip
                        console.log(`⏭️ Sent email already exists: ${message.subject || '(No subject)'}`);
                    } else {
                        console.error(`❌ Error saving sent email: ${message.subject || '(No subject)'}`, error);
                    }
                }
            }
            
            if (newEmailsCount > 0) {
                console.log(`📊 Sent emails sync completed. New emails: ${newEmailsCount}/${sentMessages.length}`);
            } else {
                console.log('📭 Sent emails sync completed. No new sent emails found.');
            }
            return { success: true, newEmails: newEmailsCount, totalChecked: sentMessages.length };
        } catch (error) {
            console.error('❌ Error syncing sent emails:', error);
            throw error;
        }
    }

    /**
     * Send email using SendGrid with format options
     */
    async sendEmail(to, subject, content, attachments = [], emailFormat = 'html') {
        console.log(`📧 Sending email via SendGrid with format: ${emailFormat}`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log('📄 Email content length:', content.length);
        console.log('📄 Email content preview:', content.substring(0, 200) + '...');
        console.log('📄 Email content (last 200 chars):', content.substring(content.length - 200));

        try {
            let result;
            
            if (emailFormat === 'plaintext') {
                // Send as plain text to preserve DOC tags exactly
                console.log('📝 Sending as plain text format (no HTML stripping)');
                result = await sendgridService.sendEmailPlainText(to, subject, content, attachments);
            } else {
                // Send with custom format conversion
                console.log('📧 Sending with custom format conversion');
                result = await sendgridService.sendEmail(to, subject, content, attachments);
            }
            
            console.log('✅ Email sent successfully via SendGrid');
            return {
                success: true,
                provider: 'SendGrid',
                messageId: result.messageId || 'sendgrid_' + Date.now(),
                format: emailFormat
            };
        } catch (error) {
            console.log('❌ SendGrid failed:', error.message);
            console.log('❌ ERROR DETAILS:', error);
            
            // Temporarily disable Graph fallback to force SendGrid debugging
            throw new Error(`SendGrid failed: ${error.message}`);
        }
    }

    /**
     * Get email provider status
     */
    async getProviderStatus() {
        const status = {
            microsoftGraph: { available: false, error: null },
            sendgrid: { available: false, error: null }
        };

        // Test Microsoft Graph
        try {
            const testResult = await gmailService.getCurrentUser();
            status.microsoftGraph.available = true;
        } catch (error) {
            status.microsoftGraph.error = error.message;
        }

        // Test SendGrid
        try {
            // Simple API key validation test
            const testResult = await sendgridService.testConnection();
            status.sendgrid.available = testResult;
        } catch (error) {
            status.sendgrid.error = error.message;
        }

        return status;
    }

    async forceCompleteResync() {
        console.log('🔄 Starting force complete resync of all emails...');
        
        try {
            // Using gmailService instead of graphService
            
            // Get ALL messages from Graph API (not just new ones)
            console.log('📧 Fetching ALL emails from Microsoft Graph...');
            const allMessages = await gmailService.getMessages(200); // Get more messages
            
            console.log(`📊 Found ${allMessages.length} total emails in Graph API`);
            
            let newEmailsCount = 0;
            let processedCount = 0;
            
            for (const message of allMessages) {
                try {
                    processedCount++;
                    console.log(`🔄 Processing email ${processedCount}/${allMessages.length}: "${message.subject}"`);
                    
                    // Check if email already exists in database
                    const existingEmail = await new Promise((resolve) => {
                        db.get('SELECT id FROM emails WHERE message_id = ?', [message.id], (err, row) => {
                            resolve(row);
                        });
                    });
                    
                    if (!existingEmail) {
                        // Email doesn't exist, save it
                        console.log(`➕ New email found: "${message.subject}"`);
                        const savedEmail = await this.saveEmailToDatabase(message, 'incoming');
                        
                        // Process attachments if any
                        if (message.hasAttachments) {
                            console.log(`📎 Processing ${message.attachments?.length || 'unknown'} attachments...`);
                            try {
                                for (const attachment of message.attachments || []) {
                                    if (attachment['@odata.type'] === '#microsoft.graph.fileAttachment') {
                                        const fullAttachment = await gmailService.downloadAttachment(message.id, attachment.id);
                                        await this.saveAttachment(savedEmail.id, fullAttachment, 'incoming');
                                    }
                                }
                            } catch (attachmentError) {
                                console.error(`❌ Error processing attachments for "${message.subject}":`, attachmentError.message);
                            }
                        }
                        
                        newEmailsCount++;
                    } else {
                        console.log(`⏭️  Email already exists: "${message.subject}"`);
                    }
                    
                } catch (emailError) {
                    console.error(`❌ Error processing email "${message.subject}":`, emailError.message);
                }
            }
            
            // Also sync sent emails
            console.log('📤 Syncing sent emails...');
            await this.syncSentEmails();
            
            const result = {
                totalEmailsChecked: allMessages.length,
                newEmails: newEmailsCount,
                processedEmails: processedCount,
                timestamp: new Date().toISOString()
            };
            
            console.log(`✅ Force resync completed:`, result);
            return result;
            
        } catch (error) {
            console.error('❌ Error in force complete resync:', error);
            throw error;
        }
    }
}

module.exports = new EmailService();
