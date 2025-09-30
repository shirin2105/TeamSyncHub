const sgMail = require('@sendgrid/mail');

// SendGrid Configuration
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || 'your-sendgrid-api-key';
const FROM_EMAIL = process.env.FROM_EMAIL || 'your-verified-email@yourdomain.com'; // Verified sender email

// Initialize SendGrid
sgMail.setApiKey(SENDGRID_API_KEY);

const sendgridConfig = {
    apiKey: SENDGRID_API_KEY,
    fromEmail: FROM_EMAIL,
    fromName: process.env.FROM_NAME || 'Email Manager System'
};

module.exports = {
    sgMail,
    sendgridConfig
};
