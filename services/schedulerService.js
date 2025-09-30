const cron = require('node-cron');
const emailService = require('./emailService');

class SchedulerService {
    constructor() {
        this.isRunning = false;
    }

    startEmailChecker() {
        if (this.isRunning) {
            console.log('Email checker is already running.');
            return;
        }

        // Chạy mỗi 2 tiếng (0 */2 * * *)
        this.emailCheckerTask = cron.schedule('0 */2 * * *', async () => {
            console.log('Running scheduled email check...');
            try {
                await emailService.processNewEmails();
                await emailService.syncSentEmails();
            } catch (error) {
                console.error('Error in scheduled email check:', error);
            }
        });

        this.isRunning = true;
        console.log('Email checker started. Will run every 2 hours.');

        // Chạy lần đầu ngay khi khởi động
        setTimeout(async () => {
            console.log('Running initial email check...');
            try {
                await emailService.processNewEmails();
                await emailService.syncSentEmails();
            } catch (error) {
                console.error('Error in initial email check:', error);
            }
        }, 5000); // Delay 5 giây để đảm bảo server đã khởi động hoàn toàn
    }

    stopEmailChecker() {
        if (this.emailCheckerTask) {
            this.emailCheckerTask.destroy();
            this.isRunning = false;
            console.log('Email checker stopped.');
        }
    }

    manualEmailCheck() {
        console.log('Manual email check triggered...');
        return Promise.all([
            emailService.processNewEmails(),
            emailService.syncSentEmails()
        ]);
    }

    async forceCompleteResync() {
        console.log('🔄 Force complete resync triggered...');
        try {
            // Force resync by calling emailService with force flag
            const result = await emailService.forceCompleteResync();
            return result;
        } catch (error) {
            console.error('❌ Error in force complete resync:', error);
            throw error;
        }
    }
}

module.exports = new SchedulerService();
