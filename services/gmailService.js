const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { gmailConfig } = require('../config/gmailConfig');

class GmailService {
    constructor() {
        this.gmail = null;
        this.auth = null;
    }

    async authenticate() {
        try {
            // Sử dụng credentials từ config
            const { client_id, client_secret, redirect_uri } = gmailConfig;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

            // Đọc token đã lưu (nếu có)
            const tokenPath = path.join(__dirname, '..', 'config', 'gmail-token.json');
            if (fs.existsSync(tokenPath)) {
                const token = JSON.parse(fs.readFileSync(tokenPath));
                oAuth2Client.setCredentials(token);
            } else {
                console.log('⚠️ Gmail token not found. Need to authorize first.');
                console.log('🔗 Visit this URL to authorize:');
                const authUrl = oAuth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: gmailConfig.scopes,
                });
                console.log(authUrl);
                throw new Error('GMAIL_AUTH_REQUIRED: Please authorize Gmail access');
            }

            this.auth = oAuth2Client;
            this.gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
            console.log('✅ Gmail authenticated successfully');
            return true;
        } catch (error) {
            console.error('❌ Gmail authentication failed:', error.message);
            throw error;
        }
    }

    async getMessages(count = 50) {
        try {
            if (!this.gmail) {
                await this.authenticate();
            }

            console.log('🔄 Getting Gmail messages...');
            
            // Lấy danh sách message IDs
            const listResponse = await this.gmail.users.messages.list({
                userId: 'me',
                maxResults: count,
                q: 'in:inbox' // Chỉ lấy inbox
            });

            if (!listResponse.data.messages) {
                console.log('📭 No messages found');
                return [];
            }

            // Lấy chi tiết từng message
            const messages = [];
            for (const message of listResponse.data.messages.slice(0, count)) {
                try {
                    const messageResponse = await this.gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    const msg = this.parseGmailMessage(messageResponse.data);
                    messages.push(msg);
                } catch (msgError) {
                    console.error('Error getting message:', msgError.message);
                }
            }

            console.log(`✅ Retrieved ${messages.length} Gmail messages`);
            return messages;
        } catch (error) {
            console.error('❌ Error getting Gmail messages:', error.message);
            throw error;
        }
    }

    parseGmailMessage(data) {
        const headers = data.payload.headers;
        const getHeader = (name) => {
            const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
            return header ? header.value : '';
        };

        // Lấy body content
        let bodyContent = '';
        let bodyType = 'text';
        
        if (data.payload.parts) {
            // Multi-part message
            for (const part of data.payload.parts) {
                if (part.mimeType === 'text/html' && part.body.data) {
                    bodyContent = Buffer.from(part.body.data, 'base64').toString();
                    bodyType = 'html';
                    break;
                } else if (part.mimeType === 'text/plain' && part.body.data) {
                    bodyContent = Buffer.from(part.body.data, 'base64').toString();
                    bodyType = 'text';
                }
            }
        } else if (data.payload.body.data) {
            // Single part message
            bodyContent = Buffer.from(data.payload.body.data, 'base64').toString();
            bodyType = data.payload.mimeType === 'text/html' ? 'html' : 'text';
        }

        // Tạo object tương thích với Microsoft Graph format
        return {
            id: data.id,
            subject: getHeader('Subject'),
            from: {
                emailAddress: {
                    address: getHeader('From').match(/<(.+)>/)?.[1] || getHeader('From'),
                    name: getHeader('From').replace(/<.+>/, '').trim()
                }
            },
            toRecipients: [{
                emailAddress: {
                    address: getHeader('To').match(/<(.+)>/)?.[1] || getHeader('To'),
                    name: getHeader('To').replace(/<.+>/, '').trim()
                }
            }],
            receivedDateTime: new Date(parseInt(data.internalDate)).toISOString(),
            sentDateTime: new Date(parseInt(data.internalDate)).toISOString(),
            isRead: !data.labelIds.includes('UNREAD'),
            hasAttachments: data.payload.parts?.some(part => part.filename) || false,
            body: {
                content: bodyContent,
                contentType: bodyType
            },
            bodyPreview: bodyContent.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
            attachments: this.parseAttachments(data.payload.parts || [])
        };
    }

    parseAttachments(parts) {
        const attachments = [];
        for (const part of parts) {
            if (part.filename && part.body.attachmentId) {
                attachments.push({
                    id: part.body.attachmentId,
                    name: part.filename,
                    contentType: part.mimeType,
                    size: part.body.size || 0
                });
            }
        }
        return attachments;
    }

    async sendEmail(emailData) {
        try {
            if (!this.gmail) {
                await this.authenticate();
            }

            console.log('📧 Sending Gmail message...');

            // Tạo email message format
            const message = [
                `To: ${emailData.toRecipients.map(r => r.emailAddress.address).join(', ')}`,
                `Subject: ${emailData.subject}`,
                'Content-Type: text/html; charset=utf-8',
                '',
                emailData.body.content
            ].join('\n');

            const encodedMessage = Buffer.from(message).toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            console.log('✅ Gmail message sent successfully');
            return { success: true, messageId: response.data.id };
        } catch (error) {
            console.error('❌ Error sending Gmail message:', error.message);
            throw error;
        }
    }

    async downloadAttachment(messageId, attachmentId) {
        try {
            if (!this.gmail) {
                await this.authenticate();
            }

            console.log('📎 Downloading Gmail attachment...');
            
            const attachment = await this.gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: messageId,
                id: attachmentId
            });

            // Convert base64 data to buffer
            const data = Buffer.from(attachment.data.data, 'base64');
            
            return {
                data: data,
                size: attachment.data.size || data.length
            };
        } catch (error) {
            console.error('❌ Error downloading Gmail attachment:', error.message);
            throw error;
        }
    }

    async getSentMessages(count = 100) {
        try {
            if (!this.gmail) {
                await this.authenticate();
            }

            console.log('📤 Getting Gmail sent messages...');
            
            // Lấy messages từ Sent folder
            const listResponse = await this.gmail.users.messages.list({
                userId: 'me',
                maxResults: count,
                q: 'in:sent' // Chỉ lấy sent messages
            });

            if (!listResponse.data.messages) {
                console.log('📭 No sent messages found');
                return [];
            }

            // Lấy chi tiết từng message
            const messages = [];
            for (const message of listResponse.data.messages) {
                try {
                    const messageResponse = await this.gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    const msg = this.parseGmailMessage(messageResponse.data);
                    messages.push(msg);
                } catch (msgError) {
                    console.error('Error getting sent message:', msgError.message);
                }
            }

            console.log(`✅ Retrieved ${messages.length} Gmail sent messages`);
            return messages;
        } catch (error) {
            console.error('❌ Error getting Gmail sent messages:', error.message);
            throw error;
        }
    }

    async getCurrentUser() {
        try {
            if (!this.gmail) {
                await this.authenticate();
            }

            console.log('👤 Getting Gmail user profile...');
            
            const profile = await this.gmail.users.getProfile({
                userId: 'me'
            });

            return {
                email: profile.data.emailAddress,
                messagesTotal: profile.data.messagesTotal,
                threadsTotal: profile.data.threadsTotal,
                historyId: profile.data.historyId
            };
        } catch (error) {
            console.error('❌ Error getting Gmail user profile:', error.message);
            throw error;
        }
    }

    getAuthUrl() {
        const { client_id, client_secret, redirect_uri } = gmailConfig;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
        
        return oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: gmailConfig.scopes,
        });
    }

    async authorizeCallback(code) {
        try {
            const { client_id, client_secret, redirect_uri } = gmailConfig;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);

            // Lưu token
            const tokenPath = path.join(__dirname, '..', 'config', 'gmail-token.json');
            fs.writeFileSync(tokenPath, JSON.stringify(tokens));

            console.log('✅ Gmail authorization successful');
            return tokens;
        } catch (error) {
            console.error('❌ Gmail authorization failed:', error.message);
            throw error;
        }
    }
}

module.exports = new GmailService();
