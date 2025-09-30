# Email Manager App

Ứng dụng quản lý email tích hợp với Gmail và Office 365 sử dụng APIs.

## Tính năng

- ✅ Kết nối với tài khoản Gmail qua Gmail API
- ✅ Tự động kiểm tra email mới mỗi 2 tiếng
- ✅ Giao diện gửi email với hỗ trợ file đính kèm
- ✅ Lưu trữ thông tin email trong cơ sở dữ liệu SQLite
- ✅ Quản lý file đính kèm theo cấu trúc thư mục YYYY/MM/DD
- ✅ Hiển thị chi tiết email đã gửi và nhận
- ✅ Phân loại email đến và đi
- ✅ Tự động tải và lưu file đính kèm
- ✅ Tích hợp với SendGrid để gửi email
- ✅ Hỗ trợ Office 365 và Microsoft Graph API

## Cài đặt

### 1. Clone dự án
```bash
git clone <repository-url>
cd email-manager-app
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình môi trường

Sao chép file `.env.example` thành `.env` và điền thông tin cần thiết:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env` với thông tin của bạn:

```env
# Session Secret (tạo một chuỗi ngẫu nhiên dài)
SESSION_SECRET=your-very-long-random-session-secret-here

# Google OAuth Configuration
# Lấy từ: https://console.cloud.google.com/
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GMAIL_EMAIL=your-gmail@gmail.com

# Microsoft OAuth Configuration  
# Lấy từ: https://portal.azure.com/
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# SendGrid Configuration
# Lấy API key từ: https://sendgrid.com/
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=your-verified-email@yourdomain.com
FROM_NAME=Email Manager System

# Application URL
APP_URL=http://localhost:3000

# Server Port
PORT=3000
```

### 4. Cấu hình Google Cloud Console

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project có sẵn
3. Bật Gmail API:
   - Vào "APIs & Services" > "Library"
   - Tìm "Gmail API" và bật
4. Tạo OAuth 2.0 credentials:
   - Vào "APIs & Services" > "Credentials"
   - Nhấp "Create Credentials" > "OAuth client ID"
   - Chọn "Web application"
   - Thêm redirect URI: `http://localhost:3000/auth/callback`
   - Lưu Client ID và Client Secret vào file `.env`

### 5. Cấu hình Microsoft Azure (tùy chọn)

1. Truy cập [Azure Portal](https://portal.azure.com/)
2. Vào "Azure Active Directory" > "App registrations"
3. Nhấp "New registration"
4. Điền thông tin:
   - Name: Email Manager App
   - Supported account types: Accounts in this organizational directory only
   - Redirect URI: `http://localhost:3000/auth/callback`
5. Lưu Application (client) ID và Directory (tenant) ID
6. Tạo client secret:
   - Vào "Certificates & secrets"
   - Nhấp "New client secret"
   - Lưu secret value vào file `.env`

### 6. Cấu hình SendGrid (tùy chọn)

1. Tạo tài khoản tại [SendGrid](https://sendgrid.com/)
2. Tạo API Key:
   - Vào "Settings" > "API Keys"
   - Nhấp "Create API Key"
   - Chọn "Full Access" hoặc tạo key với quyền gửi email
3. Verify sender email:
   - Vào "Settings" > "Sender Authentication"
   - Verify email address hoặc domain

### 7. Chạy ứng dụng

```bash
npm start
```

Truy cập ứng dụng tại: `http://localhost:3000`

## Cấu trúc Project

```
email-manager-app/
├── app.js                 # File chính khởi tạo server
├── package.json           # Dependencies và scripts
├── .env.example           # Template file môi trường
├── .gitignore            # File ignore cho Git
├── config/
│   ├── database.js       # Cấu hình SQLite database
│   ├── gmailConfig.js    # Cấu hình Gmail API
│   ├── sendgridConfig.js # Cấu hình SendGrid
│   └── passportConfig.js # Cấu hình authentication
├── models/               # Database models
├── routes/              # Express routes
├── services/            # Business logic services
├── middleware/          # Express middleware
├── views/              # EJS templates
├── public/             # Static files (CSS, JS, images)
├── attachments/        # File đính kèm được lưu trữ
└── utils/              # Utility functions
```

## Sử dụng

1. **Kết nối Gmail**: Nhấp vào nút "Connect Gmail" và đăng nhập
2. **Xem emails**: Emails sẽ được tự động đồng bộ và hiển thị
3. **Gửi email**: Sử dụng form gửi email với hỗ trợ file đính kèm
4. **Quản lý attachments**: File đính kèm được tự động tải và lưu trữ

## API Endpoints

- `GET /` - Trang chính
- `GET /auth/gmail` - Bắt đầu OAuth flow với Gmail
- `GET /auth/callback` - Callback sau khi OAuth thành công
- `POST /send-email` - Gửi email mới
- `GET /api/emails` - Lấy danh sách emails
- `GET /email/:id` - Xem chi tiết email

## Troubleshooting

### Gmail API không hoạt động
- Kiểm tra credentials trong file `.env`
- Đảm bảo Gmail API đã được bật trong Google Cloud Console
- Kiểm tra redirect URI chính xác

### SendGrid không gửi được email
- Kiểm tra API key hợp lệ
- Đảm bảo sender email đã được verify
- Kiểm tra domain authentication nếu cần

### Database errors
- Xóa file `email_manager.db` để reset database
- Kiểm tra quyền ghi file trong thư mục project

## Bảo mật

⚠️ **Quan trọng**: 
- Không commit file `.env` lên Git
- Sử dụng HTTPS trong production
- Thay đổi `SESSION_SECRET` thành chuỗi ngẫu nhiên mạnh
- Hạn chế scope permissions khi có thể
- Định kỳ rotate API keys và secrets

## License

MIT License

## Đóng góp

1. Fork project
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request
