import express from 'express';
import { auth } from '../middlewares/auth.js';
import { getProjectAnalytics, getRealtimeVisitors } from '../controllers/analyticsController.js';

const router = express.Router();

// Get project analytics
router.get('/:projectId', auth, getProjectAnalytics);

// Get real-time visitors
router.get('/:projectId/realtime', auth, getRealtimeVisitors);

export default router; 