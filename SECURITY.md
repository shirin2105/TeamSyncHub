# Security Guidelines for Email Manager App

## Thông tin nhạy cảm đã được xóa

Trước khi upload lên GitHub, tất cả thông tin nhạy cảm đã được xóa và thay thế bằng placeholders:

### ✅ Đã xóa:
- Gmail Client ID và Client Secret
- Microsoft Client ID, Tenant ID và Client Secret  
- SendGrid API Key
- Email addresses thực tế
- Access tokens và refresh tokens
- Database với dữ liệu thực
- File attachments trong thư mục attachments/

### ✅ Đã thay thế bằng:
- Environment variables với placeholders
- Dummy configuration values
- Template email addresses
- Empty token files

## Cách cấu hình an toàn

### 1. File môi trường (.env)

```env
# ❌ KHÔNG BAO GIỜ commit file .env
# ✅ Chỉ commit .env.example với placeholder values

# Tạo SESSION_SECRET mạnh
SESSION_SECRET=$(openssl rand -base64 32)

# Sử dụng environment variables trong production
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
```

### 2. Git Security

```bash
# Đảm bảo .gitignore được cấu hình đúng
echo ".env" >> .gitignore
echo "config/gmail-token.json" >> .gitignore
echo "*.db" >> .gitignore
echo "attachments/" >> .gitignore

# Kiểm tra trước khi commit
git status
git diff --cached

# Nếu đã commit nhầm sensitive data
git filter-branch --force --index-filter \
'git rm --cached --ignore-unmatch config/gmail-token.json' \
--prune-empty --tag-name-filter cat -- --all
```

### 3. Production Deployment

```bash
# Sử dụng environment variables
export SESSION_SECRET="your-production-secret"
export GOOGLE_CLIENT_ID="your-production-client-id"
# ... other vars

# Hoặc sử dụng .env file với quyền hạn chế
chmod 600 .env
chown app:app .env
```

### 4. Database Security

```javascript
// Không lưu plaintext passwords
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(password, 10);

// Sử dụng parameterized queries
const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
const user = stmt.get([email]);
```

### 5. API Key Management

```javascript
// Rotate keys định kỳ
// Sử dụng key management services trong production
// Giám sát usage và set up alerts

// Validate API keys
if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY.includes('placeholder')) {
    throw new Error('Invalid API configuration');
}
```

### 6. OAuth Security

```javascript
// Sử dụng HTTPS trong production
const redirectUri = process.env.NODE_ENV === 'production' 
    ? 'https://yourdomain.com/auth/callback'
    : 'http://localhost:3000/auth/callback';

// Validate state parameter để prevent CSRF
app.get('/auth/callback', (req, res) => {
    if (req.query.state !== req.session.oauthState) {
        return res.status(400).send('Invalid state parameter');
    }
    // ... continue OAuth flow
});
```

## Security Checklist

- [ ] File `.env` được thêm vào `.gitignore`
- [ ] Không có hardcoded credentials trong source code
- [ ] Database file được ignore trong Git
- [ ] Attachments folder được ignore trong Git
- [ ] Token files được ignore trong Git
- [ ] SESSION_SECRET là random và mạnh
- [ ] HTTPS được sử dụng trong production
- [ ] API keys được rotate định kỳ
- [ ] Error messages không expose sensitive info
- [ ] Input validation được implement đầy đủ
- [ ] Rate limiting được setup cho APIs
- [ ] Logging không chứa sensitive data

## Incident Response

Nếu vô tình expose sensitive data:

1. **Immediate Actions**:
   - Revoke tất cả API keys và tokens
   - Change tất cả passwords
   - Remove sensitive commits từ Git history

2. **Investigation**:
   - Kiểm tra access logs
   - Xác định scope của exposure
   - Document timeline

3. **Recovery**:
   - Generate new credentials
   - Update production environment
   - Monitor for suspicious activity

4. **Prevention**:
   - Review security practices
   - Update team training
   - Implement additional safeguards

## Monitoring và Alerting

```javascript
// Log security events
const securityLog = (event, details) => {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'security',
        event,
        details: sanitizeDetails(details)
    }));
};

// Monitor API usage
const apiUsageMonitor = (req, res, next) => {
    // Track usage patterns
    // Alert on suspicious activity
    next();
};
```

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [GitHub Security Advisories](https://github.com/advisories)
