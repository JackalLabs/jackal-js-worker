import winston from 'winston'

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
}

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
}

// Tell winston that you want to link the colors
winston.addColors(colors)

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true  }),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
      ),
    ),
  }),
  // File transport for errors
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.prettyPrint()
    ),
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.prettyPrint()
    ),
  }),
]

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,
})

// Create logs directory if it doesn't exist
import { mkdirSync } from 'fs'
try {
  mkdirSync('logs', { recursive: true })
} catch (err) {
  // Directory already exists or other error, ignore
}

export default logger

// Global console.log replacement
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
}

// Override console methods
console.log = (...args: any[]) => {
  logger.info(args.join(' '))
}

console.error = (...args: any[]) => {
  logger.error(args.join(' '))
}

console.warn = (...args: any[]) => {
  logger.warn(args.join(' '))
}

console.info = (...args: any[]) => {
  logger.info(args.join(' '))
}

console.debug = (...args: any[]) => {
  logger.debug(args.join(' '))
}

// Export original console methods in case they're needed
export { originalConsole }
