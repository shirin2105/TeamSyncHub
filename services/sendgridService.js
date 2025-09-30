const sgMail = require('@sendgrid/mail');
const fs = require('fs-extra');
const path = require('path');

class SendGridService {
    constructor() {
        // Set API key with the provided SendGrid API key
        this.apiKey = process.env.SENDGRID_API_KEY || 'your-sendgrid-api-key';
        sgMail.setApiKey(this.apiKey);
        
        this.fromEmail = process.env.FROM_EMAIL || 'your-email@yourdomain.com';
        this.fromName = process.env.FROM_NAME || 'Email Manager App';
    }

    /**
     * Gửi email qua SendGrid
     */
    async sendEmail(to, subject, content, attachments = []) {
        try {
            console.log('📧 Sending email via SendGrid...');
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log('📄 SendGrid content length:', content.length);
            console.log('📄 SendGrid content preview:', content.substring(0, 200) + '...');
            console.log('📄 SendGrid content (last 200 chars):', content.substring(content.length - 200));

            // Prepare attachments
            const sgAttachments = [];
            if (attachments && attachments.length > 0) {
                for (const attachment of attachments) {
                    try {
                        const fileContent = await fs.readFile(attachment.path);
                        const base64Content = fileContent.toString('base64');
                        
                        sgAttachments.push({
                            content: base64Content,
                            filename: attachment.filename || path.basename(attachment.path),
                            type: attachment.contentType || 'application/octet-stream',
                            disposition: 'attachment'
                        });
                        
                        console.log(`📎 Attached: ${attachment.filename || path.basename(attachment.path)}`);
                    } catch (fileError) {
                        console.error(`❌ Error reading attachment ${attachment.path}:`, fileError.message);
                    }
                }
            }

            // Check if content contains DOC tags and convert to custom format
            // Prepare email message
            const msg = {
                to: to,
                from: {
                    email: this.fromEmail,
                    name: this.fromName
                },
                subject: subject,
                html: content,
                attachments: sgAttachments.length > 0 ? sgAttachments : undefined
            };
            
            console.log('📧 Sending email via SendGrid');
            const response = await sgMail.send(msg);
            console.log('✅ Email sent successfully via SendGrid');
            return {
                success: true,
                messageId: response[0].headers['x-message-id'],
                provider: 'SendGrid',
                statusCode: response[0].statusCode
            };

        } catch (error) {
            console.error('❌ SendGrid Error:', error);
            
            if (error.response) {
                console.error('SendGrid Error Details:', error.response.body);
            }
            
            throw new Error(`SendGrid send failed: ${error.message}`);
        }
    }

    /**
     * Send email as plain text only (preserves DOC tags exactly)
     */
    async sendEmailPlainText(to, subject, content, attachments = []) {
        try {
            console.log('📝 Sending plain text email via SendGrid...');
            console.log(`📧 To: ${to}`);
            console.log(`📧 Subject: ${subject}`);
            console.log(`📄 Content: ${content}`);

            // Process attachments
            const sgAttachments = [];
            if (attachments && attachments.length > 0) {
                for (const file of attachments) {
                    const fileContent = await fs.readFile(file.path);
                    sgAttachments.push({
                        content: fileContent.toString('base64'),
                        filename: file.originalname,
                        type: file.mimetype,
                        disposition: 'attachment'
                    });
                }
            }

            const msg = {
                to: Array.isArray(to) ? to : to.split(',').map(email => email.trim()),
                from: {
                    email: this.fromEmail,
                    name: this.fromName
                },
                subject: subject,
                text: content, // Only send as text, no HTML version
                // Explicitly avoid HTML to prevent any stripping
                attachments: sgAttachments
            };

            console.log('📨 Sending plain text email...');
            const response = await sgMail.send(msg);
            
            console.log('✅ Plain text email sent successfully via SendGrid');
            console.log(`📊 SendGrid Response: ${response[0].statusCode}`);
            
            return { 
                success: true, 
                messageId: response[0].headers['x-message-id'],
                provider: 'SendGrid',
                statusCode: response[0].statusCode,
                format: 'plain-text'
            };

        } catch (error) {
            console.error('❌ SendGrid plain text error:', error);
            
            if (error.response) {
                console.error('SendGrid Error Details:', error.response.body);
            }
            
            throw new Error(`SendGrid plain text send failed: ${error.message}`);
        }
    }

    /**
     * Validate SendGrid configuration
     */
    async validateConfiguration() {
        try {
            if (!this.apiKey || this.apiKey === 'your-sendgrid-api-key') {
                throw new Error('SendGrid API key not configured');
            }

            // Test API key by getting account info
            const request = require('@sendgrid/client');
            request.setApiKey(this.apiKey);
            
            const [response] = await request.request({
                method: 'GET',
                url: '/v3/user/account'
            });

            console.log('✅ SendGrid configuration valid');
            console.log(`Account: ${response.body.first_name} ${response.body.last_name}`);
            
            return true;
        } catch (error) {
            console.error('❌ SendGrid configuration invalid:', error.message);
            return false;
        }
    }

    /**
     * Get SendGrid stats
     */
    async getStats() {
        try {
            const request = require('@sendgrid/client');
            request.setApiKey(this.apiKey);
            
            const today = new Date().toISOString().split('T')[0];
            
            const [response] = await request.request({
                method: 'GET',
                url: `/v3/stats?start_date=${today}&end_date=${today}`
            });

            return response.body;
        } catch (error) {
            console.error('❌ Error getting SendGrid stats:', error.message);
            return null;
        }
    }

    /**
     * Test SendGrid connection and configuration
     */
    async testConnection() {
        try {
            console.log('🔍 Testing SendGrid configuration...');
            
            // Test with sandbox mode to avoid sending actual email
            const testMsg = {
                to: 'test@example.com',
                from: this.fromEmail,
                subject: 'SendGrid Configuration Test',
                text: 'This is a test email to verify SendGrid configuration.',
                mailSettings: {
                    sandboxMode: {
                        enable: true // This prevents actual email sending
                    }
                }
            };

            await sgMail.send(testMsg);
            console.log('✅ SendGrid configuration is valid');
            return true;
        } catch (error) {
            console.error('❌ SendGrid configuration error:', error.message);
            return false;
        }
    }
}

module.exports = new SendGridService();
