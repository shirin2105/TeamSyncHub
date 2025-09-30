// Gmail API Configuration
const gmailConfig = {
    // Client ID từ Google Cloud Console
    client_id: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
    
    // Client Secret từ Google Cloud Console
    client_secret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret', 
    
    // Redirect URI (phải giống trong Google Cloud Console)
    redirect_uri: process.env.APP_URL ? `${process.env.APP_URL}/auth/callback` : 'http://localhost:3000/auth/callback',
    
    // Scopes Gmail cần thiết
    scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',    // Đọc email
        'https://www.googleapis.com/auth/gmail.send',        // Gửi email  
        'https://www.googleapis.com/auth/gmail.modify'       // Sửa email (mark as read, etc)
    ],
    
    // Email Gmail của bạn
    email: process.env.GMAIL_EMAIL || 'your-gmail@gmail.com'
};

module.exports = {
    gmailConfig
};
