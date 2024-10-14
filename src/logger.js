import log4js from 'log4js'

log4js.configure({
    appenders: {
        dateFileAppender: {
            type: 'dateFile',
            filename: 'logs/application.log',
            pattern: '.yyyy-MM-dd',
            keepFileExt: true,
            numBackups: 7,  // Optional: keep logs for 7 days
            maxLogSize: 10485760, // 10MB max size before rotating
        },
        sizeFileAppender: {
            type: 'file',
            filename: 'logs/application-size.log',
            maxLogSize: 10485760, // 10MB
            backups: 3, // Keep 3 old log files
        },
        console: {
            type: 'console'
        }
    },
    categories: {
        default: { appenders: ['dateFileAppender', 'sizeFileAppender', 'console'], level: 'info' }
    }
});

const logger = log4js.getLogger();

export default logger

