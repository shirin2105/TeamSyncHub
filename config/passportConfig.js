const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const db = require('./database');

// Load environment variables
require('dotenv').config();

// Cấu hình Passport
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        done(err, user);
    });
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
    callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const providerId = profile.id;
        
        // Tìm user theo provider_id và provider trước (bỏ qua nếu provider_id là 'default')
        db.get(
            'SELECT * FROM users WHERE provider_id = ? AND provider = ? AND provider_id != ?',
            [providerId, 'google', 'default'],
            (err, existingUser) => {
                if (err) return done(err);
                
                if (existingUser) {
                    // Cập nhật last_login
                    db.run(
                        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                        [existingUser.id]
                    );
                    return done(null, existingUser);
                }
                
                // Kiểm tra theo email (bao gồm cả những user có provider_id = 'default')
                db.get(
                    'SELECT * FROM users WHERE email = ?',
                    [email],
                    (err, userByEmail) => {
                        if (err) return done(err);
                        
                        if (userByEmail) {
                            // User đã tồn tại với email này
                            // Cập nhật provider info với provider_id thật từ Google
                            db.run(
                                'UPDATE users SET provider = ?, provider_id = ?, name = ?, avatar_url = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
                                ['google', providerId, profile.displayName, profile.photos[0]?.value || userByEmail.avatar_url, userByEmail.id],
                                (err) => {
                                    if (err) return done(err);
                                    
                                    // Cập nhật object để trả về
                                    userByEmail.provider = 'google';
                                    userByEmail.provider_id = providerId;
                                    userByEmail.name = profile.displayName;
                                    userByEmail.avatar_url = profile.photos[0]?.value || userByEmail.avatar_url;
                                    
                                    console.log(`Updated user ${email} with real Google provider_id: ${providerId}`);
                                    return done(null, userByEmail);
                                }
                            );
                        } else {
                            // Tạo user hoàn toàn mới
                            const userData = {
                                email: email,
                                name: profile.displayName,
                                provider: 'google',
                                provider_id: providerId,
                                avatar_url: profile.photos[0]?.value || null
                            };
                            
                            db.run(
                                `INSERT INTO users (email, name, provider, provider_id, avatar_url, last_login) 
                                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                [userData.email, userData.name, userData.provider, userData.provider_id, userData.avatar_url],
                                function(err) {
                                    if (err) return done(err);
                                    
                                    userData.id = this.lastID;
                                    done(null, userData);
                                }
                            );
                        }
                    }
                );
            }
        );
    } catch (error) {
        done(error);
    }
}));

// Microsoft OAuth Strategy
passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID || 'your-microsoft-client-id',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'your-microsoft-client-secret',
    callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/auth/microsoft/callback`,
    scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const providerId = profile.id;
        
        // Tìm user theo provider_id và provider trước
        db.get(
            'SELECT * FROM users WHERE provider_id = ? AND provider = ?',
            [providerId, 'microsoft'],
            (err, existingUser) => {
                if (err) return done(err);
                
                if (existingUser) {
                    // Cập nhật last_login
                    db.run(
                        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                        [existingUser.id]
                    );
                    return done(null, existingUser);
                }
                
                // Nếu không tìm thấy theo provider_id, kiểm tra theo email
                db.get(
                    'SELECT * FROM users WHERE email = ?',
                    [email],
                    (err, userByEmail) => {
                        if (err) return done(err);
                        
                        if (userByEmail) {
                            // User đã tồn tại với email này nhưng provider khác
                            // Cập nhật provider info
                            db.run(
                                'UPDATE users SET provider = ?, provider_id = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
                                ['microsoft', providerId, userByEmail.id],
                                (err) => {
                                    if (err) return done(err);
                                    
                                    userByEmail.provider = 'microsoft';
                                    userByEmail.provider_id = providerId;
                                    return done(null, userByEmail);
                                }
                            );
                        } else {
                            // Tạo user hoàn toàn mới
                            const userData = {
                                email: email,
                                name: profile.displayName,
                                provider: 'microsoft',
                                provider_id: providerId,
                                avatar_url: profile.photos[0]?.value || null
                            };
                            
                            db.run(
                                `INSERT INTO users (email, name, provider, provider_id, avatar_url, last_login) 
                                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                [userData.email, userData.name, userData.provider, userData.provider_id, userData.avatar_url],
                                function(err) {
                                    if (err) return done(err);
                                    
                                    userData.id = this.lastID;
                                    done(null, userData);
                                }
                            );
                        }
                    }
                );
            }
        );
    } catch (error) {
        done(error);
    }
}));

module.exports = passport;
