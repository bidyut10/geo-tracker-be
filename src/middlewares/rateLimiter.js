import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

// API rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Tracking endpoint rate limiter (more permissive)
export const trackingRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // Limit each IP to 1000 requests per minute
  message: {
    error: 'Too many tracking requests, please try again later.'
  },
  handler: (req, res, next, options) => {
    logger.warn(`Tracking rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
}); 