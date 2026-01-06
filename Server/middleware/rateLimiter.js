const { poolPromise, sql } = require('../db');

// Simple in-memory rate limiter (in production, use Redis or similar)
const rateLimitStore = new Map();

function rateLimit(windowMs = 15 * 60 * 1000, maxRequests = 5) { // 15 minutes, 5 requests
    return async (req, res, next) => {
        const userId = req.user?.id;
        if (!userId) {
            return next(); // Skip rate limiting for unauthenticated requests
        }

        const key = `booking_${userId}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get existing requests for this user
        let userRequests = rateLimitStore.get(key) || [];

        // Filter out old requests
        userRequests = userRequests.filter(timestamp => timestamp > windowStart);

        // Check if limit exceeded
        if (userRequests.length >= maxRequests) {
            return res.status(429).json({
                message: `Too many booking requests. Please wait ${Math.ceil((userRequests[0] + windowMs - now) / 1000 / 60)} minutes before trying again.`,
                retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
            });
        }

        // Add current request
        userRequests.push(now);
        rateLimitStore.set(key, userRequests);

        // Clean up old entries periodically
        if (Math.random() < 0.01) { // 1% chance to clean up
            for (const [k, requests] of rateLimitStore.entries()) {
                const filtered = requests.filter(timestamp => timestamp > windowStart);
                if (filtered.length === 0) {
                    rateLimitStore.delete(k);
                } else {
                    rateLimitStore.set(k, filtered);
                }
            }
        }

        next();
    };
}

module.exports = { rateLimit };