import { createClient } from 'redis';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';
dotenv.config();

// Redis connection configuration
const REDIS_CONFIG = {
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: 10063, // Hardcode the port since we know it's correct
    // tls: true,
    rejectUnauthorized: false
  }
};

// Initialize Redis connections
let redisClient = null;
let trackingQueue = null;
let isRedisAvailable = false;

/**
 * Connect to Redis and initialize queues
 */
export const connectRedis = async () => {
  try {
    // Create Redis client
    redisClient = createClient(REDIS_CONFIG);

    // Handle connection events
    redisClient.on('error', (error) => {
      logger.error(`Redis connection error: ${error.message}`);
      isRedisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
      isRedisAvailable = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      isRedisAvailable = true;
    });

    redisClient.on('end', () => {
      logger.warn('Redis connection ended');
      isRedisAvailable = false;
    });

    // Connect to Redis
    await redisClient.connect();

    // Initialize tracking queue with memory-efficient settings
    trackingQueue = new Queue('tracking', {
      connection: {
        host: REDIS_CONFIG.socket.host,
        port: REDIS_CONFIG.socket.port,
        username: REDIS_CONFIG.username,
        password: REDIS_CONFIG.password,
        tls: REDIS_CONFIG.socket.tls
      },
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 500
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100 // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 24 * 3600 // Keep failed jobs for 24 hours
        }
      }
    });

    // Test connection
    await redisClient.ping();
    logger.info('Redis connection established successfully');
  } catch (error) {
    logger.error(`Failed to connect to Redis: ${error.message}`);
    isRedisAvailable = false;
    throw error;
  }
};

/**
 * Get Redis client instance with fallback
 */
export const getRedisClient = () => {
  if (!redisClient || !isRedisAvailable) {
    throw new Error('Redis client not available');
  }
  return redisClient;
};

/**
 * Get tracking queue instance with fallback
 */
export const getTrackingQueue = () => {
  if (!trackingQueue || !isRedisAvailable) {
    throw new Error('Tracking queue not available');
  }
  return trackingQueue;
};

//Check if Redis is available
 
export const isRedisReady = () => isRedisAvailable;

//Close Redis connections
export const closeRedisConnections = async () => {
  try {
    if (trackingQueue) {
      await trackingQueue.close();
    }
    if (redisClient) {
      await redisClient.quit();
    }
    isRedisAvailable = false;
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error(`Error closing Redis connections: ${error.message}`);
  }
};

// Handle process termination
process.on('SIGTERM', async () => {
  await closeRedisConnections();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeRedisConnections();
  process.exit(0);
}); 