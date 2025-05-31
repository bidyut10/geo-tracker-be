import { Worker, Queue } from 'bullmq';
import { getRedisClient, isRedisReady } from '../connections/redis.js';
import { logger } from '../utils/logger.js';
import { Event } from '../models/Event.js';
import { Session } from '../models/Session.js';

let worker = null;
let eventQueue = null;

// Initialize worker and queue if Redis is available
export const initializeWorker = () => {
  try {
    if (isRedisReady() && !worker) {
      const redisConnection = getRedisClient();

      // Initialize the Queue first
      eventQueue = new Queue('tracking', {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 50,
        }
      });

      // Initialize the Worker
      worker = new Worker('tracking', async (job) => {
        try {
          const eventData = job.data;
          logger.info(`Processing job ${job.id} with event type: ${eventData.type}`);

          // Save event to database
          const savedEvent = await Event.create(eventData);
          logger.info(`Event saved with ID: ${savedEvent._id}`);

          // Update session data
          const session = await updateSessionData(eventData, savedEvent._id);
          logger.info(`Session updated: ${session._id}`);

          return {
            eventId: savedEvent._id,
            sessionId: session._id
          };
        } catch (error) {
          logger.error(`Error processing job ${job.id}: ${error.message}`);
          logger.error(`Job data:`, job.data);
          throw error;
        }
      }, {
        connection: redisConnection,
        concurrency: 5,
        limiter: {
          max: 50,
          duration: 1000
        }
      });

      // Handle worker events
      worker.on('completed', (job, result) => {
        logger.info(`Job ${job.id} completed successfully`);
      });

      worker.on('failed', (job, error) => {
        logger.error(`Job ${job.id} failed: ${error.message}`);
      });

      worker.on('error', (error) => {
        logger.error(`Worker error: ${error.message}`);
      });

      worker.on('ready', () => {
        logger.info('Worker is ready and waiting for jobs');
      });

      logger.info('Worker and Queue initialized successfully');
      return true;
    } else if (!isRedisReady()) {
      logger.warn('Redis not ready, worker initialization skipped');
      return false;
    }
  } catch (error) {
    logger.error(`Error initializing worker: ${error.message}`);
    return false;
  }
  return !!worker;
};

// Helper function to update session data (moved from trackingController)
async function updateSessionData(eventData, eventId) {
  try {
    const updateData = {
      $set: {
        lastActivity: eventData.timestamp,
        lastEvent: eventData.type
      },
      $inc: {},
      $setOnInsert: {
        startTime: eventData.timestamp,
        user: eventData.user,
        isBounce: true
      }
    };

    // Increment counters based on event type
    switch (eventData.type) {
      case 'pageview':
        updateData.$inc.pageViews = 1;
        updateData.$set.lastPage = {
          url: eventData.page?.url,
          title: eventData.page?.title
        };
        // If this is not the first pageview, it's not a bounce
        updateData.$set.isBounce = false;
        break;
      case 'click':
        updateData.$inc['events.clicks'] = 1;
        updateData.$set.isBounce = false;
        break;
      case 'scroll':
        updateData.$inc['events.scrolls'] = 1;
        break;
      case 'form':
        updateData.$inc['events.forms'] = 1;
        updateData.$set.isBounce = false;
        break;
      case 'route':
        updateData.$inc['events.routes'] = 1;
        break;
      case 'unload':
        updateData.$set.endTime = eventData.timestamp;
        break;
    }

    // Set first page data only on insert
    if (eventData.type === 'pageview' && eventData.page) {
      updateData.$setOnInsert.firstPage = {
        url: eventData.page.url,
        title: eventData.page.title,
        referrer: eventData.page.referrer
      };
    }

    const session = await Session.findOneAndUpdate(
      {
        projectId: eventData.projectId,
        sessionId: eventData.sessionId
      },
      updateData,
      {
        upsert: true,
        new: true
      }
    );

    // Calculate session duration for unload events
    if (eventData.type === 'unload' && session.startTime) {
      const duration = eventData.timestamp - session.startTime;
      await Session.findByIdAndUpdate(session._id, {
        $set: { duration: Math.max(0, duration) }
      });
    }

    return session;

  } catch (error) {
    logger.error('Error updating session data:', error.message);
    throw error;
  }
}

// Add event to queue with fallback
export const addEvent = async (eventData) => {
  try {
    if (isRedisReady() && eventQueue) {
      const job = await eventQueue.add('process-event', eventData, {
        priority: eventData.type === 'pageview' ? 10 : 5,
        delay: 0
      });
      logger.info(`Event queued with job ID: ${job.id}`);
      return true;
    } else {
      logger.warn('Event queue not available, will process directly');
      return false;
    }
  } catch (error) {
    logger.error(`Error adding event to queue: ${error.message}`);
    return false;
  }
};

// Get queue stats
export const getQueueStats = async () => {
  try {
    if (eventQueue) {
      const waiting = await eventQueue.getWaiting();
      const active = await eventQueue.getActive();
      const completed = await eventQueue.getCompleted();
      const failed = await eventQueue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    }
    return null;
  } catch (error) {
    logger.error(`Error getting queue stats: ${error.message}`);
    return null;
  }
};

// Close worker and queue
export const closeWorker = async () => {
  try {
    if (worker) {
      await worker.close();
      worker = null;
      logger.info('Worker closed');
    }
    if (eventQueue) {
      await eventQueue.close();
      eventQueue = null;
      logger.info('Queue closed');
    }
  } catch (error) {
    logger.error(`Error closing worker/queue: ${error.message}`);
  }
};