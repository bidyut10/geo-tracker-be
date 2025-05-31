import { Worker } from 'bullmq';
import { getRedisClient, isRedisReady } from '../connections/redis.js';
import { Event } from '../models/Event.js';
import { Session } from '../models/Session.js';
import { logger } from '../utils/logger.js';

// Worker configuration for memory efficiency
const WORKER_CONFIG = {
  concurrency: 3, // Process 3 jobs at a time
  limiter: {
    max: 50, // Max 50 jobs per time window
    duration: 1000 // Time window in milliseconds
  }
};

// Fallback queue for when Redis is unavailable
const fallbackQueue = [];
let isProcessingFallback = false;

//Process events from fallback queue
async function processFallbackQueue() {
  if (isProcessingFallback || fallbackQueue.length === 0) return;

  isProcessingFallback = true;
  const batch = fallbackQueue.splice(0, 10); // Process 10 events at a time

  try {
    await Promise.all(batch.map(processEvent));
    logger.info(`Processed ${batch.length} events from fallback queue`);
  } catch (error) {
    logger.error(`Error processing fallback queue: ${error.message}`);
    // Put failed events back in queue
    fallbackQueue.unshift(...batch);
  }

  isProcessingFallback = false;
  if (fallbackQueue.length > 0) {
    setTimeout(processFallbackQueue, 1000);
  }
}

//Process a single event
async function processEvent(event) {
  try {
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
    logger.error(`Error processing event: ${error.message}`);
    throw error;
  }
}

// Initialize worker if Redis is available
let worker = null;

if (isRedisReady()) {
  worker = new Worker('tracking', async (job) => {
    try {
      return await processEvent(job.data);
    } catch (error) {
      logger.error(`Error processing job ${job.id}: ${error.message}`);
      throw error;
    }
  }, {
    connection: getRedisClient(),
    ...WORKER_CONFIG
  });

  // Handle worker events
  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed: ${error.message}`);
    // Add to fallback queue if Redis fails
    if (error.message.includes('Redis')) {
      fallbackQueue.push(job.data);
      processFallbackQueue();
    }
  });

  worker.on('error', (error) => {
    logger.error(`Worker error: ${error.message}`);
  });
}

// Export function to add events to queue
export const addEvent = async (event) => {
  try {
    if (isRedisReady() && worker) {
      await worker.add('process-event', event);
    } else {
      // Add to fallback queue if Redis is unavailable
      fallbackQueue.push(event);
      processFallbackQueue();
    }
  } catch (error) {
    logger.error(`Error adding event to queue: ${error.message}`);
    // Add to fallback queue on error
    fallbackQueue.push(event);
    processFallbackQueue();
  }
};

// Handle process termination
process.on('SIGTERM', async () => {
  if (worker) {
    await worker.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (worker) {
    await worker.close();
  }
  process.exit(0);
}); 