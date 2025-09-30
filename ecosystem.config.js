// PM2 Ecosystem Configuration for Email Manager App
// This file configures PM2 to manage the Email Manager application on the remote server

module.exports = {
  apps: [{
    name: 'email-manager-app',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }],

  deploy: {
    production: {
      user: 'superhome',
      host: '103.186.101.178',
      port: '22',
      ref: 'origin/main',
      repo: 'git@github.com:username/email-manager-app.git',
      path: '/home/superhome/email-manager-app',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
