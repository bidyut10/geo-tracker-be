import express from 'express';
import { body } from 'express-validator';
import { processEvents, serveTrackingScript } from '../controllers/trackingController.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for tracking endpoint
const trackingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

//Process tracking data from client
//Validates and queues events for processing
router.post('/',
  trackingLimiter,
  [
    body().isArray(),
    body('*.projectId').notEmpty(),
    body('*.sessionId').notEmpty(),
    body('*.type').isIn(['pageview', 'click', 'scroll', 'form', 'route', 'unload', 'custom']),
    body('*.timestamp').isNumeric()
  ],
  processEvents
);

//Serve tracking script to client
router.get('/t.js', serveTrackingScript);

export default router; 