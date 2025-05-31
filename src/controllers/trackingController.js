import { Project } from '../models/Project.js';
import { parseUserAgent } from '../utils/deviceParser.js';
import { getGeoInfo } from '../utils/geoLookup.js';
import { logger } from '../utils/logger.js';
import { addEvent } from '../worker/index.js';

//Process tracking events from client
export const processEvents = async (req, res) => {
  try {
    const events = req.body;

    // Validate events array
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Invalid events data' });
    }

    // Process events in parallel with batching and reduced batch size for memory efficiency
    const batchSize = 5; 
    const batches = [];
    
    for (let i = 0; i < events.length; i += batchSize) {
      batches.push(events.slice(i, i + batchSize));
    }

    const results = await Promise.allSettled(
      batches.map(async (batch) => {
        const enrichedEvents = await Promise.all(
          batch.map(async (event) => {
            try {
              // Verify project exists and is active
              const project = await Project.findOne({
                trackingId: event.projectId,
                isActive: true
              });

              if (!project) {
                logger.warn(`Invalid or inactive project ID: ${event.projectId}`);
                return null;
              }

              // Add user data to event
              const enrichedEvent = {
                ...event,
                user: {
                  ...parseUserAgent(req.headers['user-agent']),
                  ...await getGeoInfo(req.ip)
                }
              };

              // Add to queue or fallback
              await addEvent(enrichedEvent);

              return enrichedEvent;
            } catch (error) {
              logger.error(`Error processing event: ${error.message}`);
              return null;
            }
          })
        );

        return enrichedEvents.filter(Boolean);
      })
    );

    // Count successful and failed events
    const successful = results.reduce((count, result) => {
      if (result.status === 'fulfilled') {
        return count + result.value.length;
      }
      return count;
    }, 0);

    const failed = events.length - successful;

    res.status(202).json({
      message: 'Events queued for processing',
      stats: {
        total: events.length,
        successful,
        failed
      }
    });
  } catch (error) {
    logger.error(`Tracking error: ${error.message}`);
    res.status(500).json({ error: 'Failed to process tracking data' });
  }
};

//Serve tracking script to client
export const serveTrackingScript = (req, res) => {
  try {
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Send the tracking script
    res.sendFile('t.js', { root: './public' });
  } catch (error) {
    logger.error(`Error serving tracking script: ${error.message}`);
    res.status(500).json({ error: 'Failed to serve tracking script' });
  }
}; 