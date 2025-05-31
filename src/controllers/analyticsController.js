import { Project } from '../models/Project.js';
import { Event } from '../models/Event.js';
import { Session } from '../models/Session.js';
import { logger } from '../utils/logger.js';

//Get project analytics data
export const getProjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { startDate, endDate, groupBy = 'day' } = req.query;

    // Verify project exists and user has access
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user._id,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Parse dates
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get pageviews
    const pageviews = await Event.aggregate([
      {
        $match: {
          projectId: project._id,
          type: 'pageview',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m-%d-%H',
              date: '$timestamp'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get unique visitors
    const visitors = await Session.aggregate([
      {
        $match: {
          projectId: project._id,
          startTime: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m-%d-%H',
              date: '$startTime'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top pages
    const topPages = await Event.aggregate([
      {
        $match: {
          projectId: project._id,
          type: 'pageview',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$page.url',
          count: { $sum: 1 },
          title: { $first: '$page.title' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get user demographics
    const demographics = await Session.aggregate([
      {
        $match: {
          projectId: project._id,
          startTime: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            country: '$user.country',
            device: '$user.device.type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.country',
          devices: {
            $push: {
              device: '$_id.device',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Get bounce rate
    const bounceRate = await Session.aggregate([
      {
        $match: {
          projectId: project._id,
          startTime: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          bounces: { $sum: { $cond: ['$isBounce', 1, 0] } }
        }
      }
    ]);

    res.json({
      pageviews,
      visitors,
      topPages,
      demographics,
      bounceRate: bounceRate[0] ? (bounceRate[0].bounces / bounceRate[0].total) * 100 : 0
    });
  } catch (error) {
    logger.error(`Analytics error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve analytics data' });
  }
};

//Get real-time visitor data
export const getRealtimeVisitors = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify project exists and user has access
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user._id,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get active sessions in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const activeSessions = await Session.find({
      projectId: project._id,
      startTime: { $gte: fiveMinutesAgo },
      $or: [
        { endTime: { $exists: false } },
        { endTime: { $gte: fiveMinutesAgo } }
      ]
    }).sort({ startTime: -1 });

    res.json({
      count: activeSessions.length,
      sessions: activeSessions.map(session => ({
        id: session.sessionId,
        startTime: session.startTime,
        lastPage: session.lastPage,
        user: {
          country: session.user.country,
          device: session.user.device.type
        }
      }))
    });
  } catch (error) {
    logger.error(`Realtime error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve real-time data' });
  }
}; 