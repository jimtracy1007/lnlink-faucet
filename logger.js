const pino = require('pino');
const path = require('path');
const dayjs = require('dayjs');
const fs = require('fs');

class Logger {
  constructor(module = 'app') {
    const logDir = path.join(__dirname, 'logs');
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Clean old logs (keep 7 days)
    this.cleanOldLogs(logDir);

    const logFileName = `faucet-${dayjs().format('YYYY-MM-DD')}.log`;
    const logFilePath = path.join(logDir, logFileName);

    // Create pino logger with file and console transport
    this.logger = pino(
      {
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.transport({
        targets: [
          {
            target: 'pino-roll',
            options: {
              file: logFilePath,
              frequency: 'daily',
              size: '2M',
              mkdir: true,
            },
            level: 'info',
          },
          {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
            level: process.env.LOG_LEVEL || 'info',
          },
        ],
      })
    );

    this.module = module;
  }

  _log(level, message, ...args) {
    const logData = {
      module: this.module,
      message,
      ...(args.length > 0 && { data: args }),
    };
    this.logger[level](logData);
  }

  info(message, ...args) {
    this._log('info', message, ...args);
  }

  error(message, ...args) {
    this._log('error', message, ...args);
  }

  warn(message, ...args) {
    this._log('warn', message, ...args);
  }

  debug(message, ...args) {
    this._log('debug', message, ...args);
  }

  cleanOldLogs(logDir) {
    try {
      if (!fs.existsSync(logDir)) {
        return;
      }

      const files = fs.readdirSync(logDir);
      const now = dayjs();
      const maxAge = 7; // days

      files.forEach((file) => {
        if (file.startsWith('faucet-') && file.endsWith('.log')) {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);
          const fileAge = now.diff(dayjs(stats.mtime), 'day');

          if (fileAge > maxAge) {
            fs.unlinkSync(filePath);
          }
        }
      });
    } catch (error) {
      // Silently fail if log cleanup fails
      console.error('Failed to clean old logs:', error.message);
    }
  }
}

module.exports = Logger;
