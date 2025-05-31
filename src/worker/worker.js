import { Worker } from 'bullmq';
import { getRedisClient, isRedisReady } from '../connections/redis.js';
import { logger } from '../utils/logger.js';
import { Event } from '../models/Event.js';
import { Session } from '../models/Session.js';

let worker = null;

// Initialize worker if Redis is available
export const initializeWorker = () => {
  if (isRedisReady() && !worker) {
    worker = new Worker('tracking', async (job) => {
      try {
        const event = job.data;
        
        // Save event to database
        const savedEvent = await Event.create(event);

        // Update or create session
        const session = await Session.findOneAndUpdate(
          {
            projectId: event.projectId,
            sessionId: event.sessionId
          },
          {
            $set: {
              lastEvent: event.type,
              lastPage: event.type === 'pageview' ? event.url : undefined,
              lastActivity: new Date(event.timestamp)
            },
            $inc: {
              pageViews: event.type === 'pageview' ? 1 : 0,
              clicks: event.type === 'click' ? 1 : 0,
              scrolls: event.type === 'scroll' ? 1 : 0,
              forms: event.type === 'form' ? 1 : 0,
              routes: event.type === 'route' ? 1 : 0
            },
            $setOnInsert: {
              startTime: new Date(event.timestamp),
              user: event.user
            }
          },
          {
            upsert: true,
            new: true
          }
        );

        // Handle unload events
        if (event.type === 'unload') {
          await Session.findByIdAndUpdate(session._id, {
            $set: {
              endTime: new Date(event.timestamp),
              duration: new Date(event.timestamp) - session.startTime
            }
          });
        }

        return {
          eventId: savedEvent._id,
          sessionId: session._id
        };
      } catch (error) {
        logger.error(`Error processing job ${job.id}: ${error.message}`);
        throw error;
      }
    }, {
      connection: getRedisClient(),
      concurrency: 3,
      limiter: {
        max: 50,
        duration: 1000
      }
    });

    // Handle worker events
    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, error) => {
      logger.error(`Job ${job.id} failed: ${error.message}`);
    });

    worker.on('error', (error) => {
      logger.error(`Worker error: ${error.message}`);
    });

    logger.info('Worker initialized successfully');
  }
  return worker;
};

// Add event to queue
export const addEvent = async (event) => {
  try {
    if (isRedisReady() && worker) {
      await worker.add('process-event', event);
      return true;
    }
    logger.warn('Worker not available, event processing may be delayed');
    return false;
  } catch (error) {
    logger.error(`Error adding event to queue: ${error.message}`);
    return false;
  }
};

// Close worker
export const closeWorker = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
}; 