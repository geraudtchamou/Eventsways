import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for auth endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many attempts',
    message: 'Please try again after 15 minutes',
  },
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for RSVP submissions
 */
export const rsvpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 RSVPs per hour
  message: {
    error: 'Too many RSVP attempts',
    message: 'Please wait before submitting another RSVP',
  },
});

/**
 * Rate limiter for check-in operations
 */
export const checkinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Limit each device to 50 check-ins per 5 minutes
  message: {
    error: 'Too many check-in attempts',
    message: 'Please slow down',
  },
  keyGenerator: (req: Request) => {
    return req.headers['x-device-id'] as string || req.ip;
  },
});

/**
 * Rate limiter for file uploads
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    error: 'Upload limit exceeded',
    message: 'You have reached your upload limit for this hour',
  },
});

/**
 * Rate limiter for chat messages (prevent spam)
 */
export const chatLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 3, // Limit each IP to 3 messages per 10 seconds
  message: {
    error: 'Message limit exceeded',
    message: 'Please slow down your messaging',
  },
  skip: (req: Request) => {
    // Skip for authenticated users with higher limits
    return !!req.user;
  },
});

/**
 * Rate limiter for waitlist joins
 */
export const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each email to 5 waitlist joins per hour
  keyGenerator: (req: Request) => {
    return req.body.email || req.ip;
  },
});

/**
 * Generic rate limiter factory
 */
export const createRateLimiter = (options: {
  windowMs?: number;
  max?: number;
  message?: any;
  keyGenerator?: (req: Request) => string;
}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || { error: 'Too many requests' },
    keyGenerator: options.keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Export a default general limiter
export const rateLimiter = apiLimiter;
