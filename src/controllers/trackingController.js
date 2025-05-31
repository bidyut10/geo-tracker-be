import { Project } from '../models/Project.js';
import { Event } from '../models/Event.js';
import { Session } from '../models/Session.js';
import { parseUserAgent } from '../utils/deviceParser.js';
import { getGeoInfo } from '../utils/geoLookup.js';
import { logger } from '../utils/logger.js';
import { addEvent } from '../worker/worker.js';
import { validationResult } from 'express-validator';

// Helper function to safely parse timestamp
function parseTimestamp(timestamp) {
  if (!timestamp) return new Date();

  // If it's already a Date object
  if (timestamp instanceof Date) {
    return timestamp;
  }

  // If it's already a number (Unix timestamp)
  if (typeof timestamp === 'number') {
    // Handle both milliseconds and seconds timestamps
    const ts = timestamp > 1e12 ? timestamp : timestamp * 1000;
    return new Date(ts);
  }

  // If it's a string, try to parse it
  if (typeof timestamp === 'string') {
    // Try parsing as ISO string first
    const isoDate = new Date(timestamp);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Try parsing as number
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? new Date() : new Date(parsed);
  }

  // Fallback to current time
  return new Date();
}

// Helper function to validate and sanitize event data
function validateEventData(event) {
  const validTypes = ['pageview', 'click', 'scroll', 'form', 'route', 'unload', 'event', 'custom'];

  // Basic validation
  if (!event || typeof event !== 'object') {
    logger.warn('Event is not an object:', event);
    return null;
  }

  // Required fields
  if (!event.projectId || !event.sessionId || !event.type) {
    logger.warn('Missing required fields:', {
      hasProjectId: !!event.projectId,
      hasSessionId: !!event.sessionId,
      hasType: !!event.type
    });
    return null;
  }

  // Validate event type
  if (!validTypes.includes(event.type)) {
    logger.warn('Invalid event type:', event.type);
    return null;
  }

  // Sanitize and normalize the event
  const sanitizedEvent = {
    projectId: String(event.projectId).trim(),
    sessionId: String(event.sessionId).trim(),
    type: String(event.type).toLowerCase().trim(),
    timestamp: parseTimestamp(event.timestamp)
  };

  // Add type-specific data validation
  switch (sanitizedEvent.type) {
    case 'pageview':
      if (event.url) {
        sanitizedEvent.page = {
          url: String(event.url).substring(0, 2048),
          title: event.title ? String(event.title).substring(0, 200) : '',
          referrer: event.referrer ? String(event.referrer).substring(0, 2048) : ''
        };
      }
      break;

    case 'click':
      if (event.element) {
        sanitizedEvent.element = {
          tag: event.element.tag ? String(event.element.tag).toLowerCase() : '',
          id: event.element.id ? String(event.element.id).substring(0, 100) : '',
          class: event.element.class ? String(event.element.class).substring(0, 200) : '',
          text: event.element.text ? String(event.element.text).substring(0, 100) : ''
        };
      }
      if (event.position && typeof event.position.x === 'number' && typeof event.position.y === 'number') {
        sanitizedEvent.position = {
          x: Math.max(0, Math.min(event.position.x, 10000)),
          y: Math.max(0, Math.min(event.position.y, 10000))
        };
      }
      break;

    case 'scroll':
      if (typeof event.depth === 'number') {
        sanitizedEvent.depth = Math.max(0, Math.min(event.depth, 100));
      }
      break;

    case 'route':
      if (event.from && event.to) {
        sanitizedEvent.route = {
          from: String(event.from).substring(0, 2048),
          to: String(event.to).substring(0, 2048)
        };
      }
      break;

    case 'event':
    case 'custom':
      if (event.name) {
        sanitizedEvent.name = String(event.name).substring(0, 100);
        sanitizedEvent.properties = event.properties && typeof event.properties === 'object'
          ? event.properties
          : {};
      }
      break;
  }

  // Add additional metadata if present
  if (event.screen) {
    sanitizedEvent.screen = {
      width: typeof event.screen.width === 'number' ? event.screen.width : 0,
      height: typeof event.screen.height === 'number' ? event.screen.height : 0
    };
  }

  if (event.userAgent) {
    sanitizedEvent.userAgent = String(event.userAgent).substring(0, 500);
  }

  if (event.language) {
    sanitizedEvent.language = String(event.language).substring(0, 10);
  }

  return sanitizedEvent;
}

// Helper function to get client IP with fallbacks
function getClientIP(req) {
  return req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.headers['x-client-ip'] ||
    '127.0.0.1';
}

// Process tracking events from client
export const processEvents = async (req, res) => {
  try {
    const events = req.body;

    // Quick response to client to prevent timeouts
    res.status(202).json({
      message: 'Events received',
      timestamp: Date.now()
    });

    // Validate events array
    if (!Array.isArray(events) || events.length === 0) {
      logger.warn('Invalid events data received - not an array or empty:', {
        isArray: Array.isArray(events),
        length: events?.length,
        body: req.body
      });
      return;
    }

    logger.info(`Received ${events.length} events for processing`);

    // Limit batch size to prevent abuse
    const limitedEvents = events.slice(0, 50);

    // Get client information
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    // Parse user agent and get geo info (with error handling)
    let deviceInfo = {};
    let geoInfo = {};

    try {
      deviceInfo = parseUserAgent(userAgent);
    } catch (error) {
      logger.error('Error parsing user agent:', error.message);
      deviceInfo = {
        browser: { name: 'Unknown', version: 'Unknown' },
        os: { name: 'Unknown', version: 'Unknown' },
        device: { type: 'desktop', model: 'Unknown', vendor: 'Unknown' },
        engine: { name: 'Unknown', version: 'Unknown' }
      };
    }

    try {
      geoInfo = await getGeoInfo(clientIP);
    } catch (error) {
      logger.error('Error getting geo info:', error.message);
      geoInfo = {
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown',
        latitude: null,
        longitude: null
      };
    }

    // Process each event
    let processed = 0;
    let skipped = 0;

    for (const rawEvent of limitedEvents) {
      try {
        // Validate and sanitize event
        const sanitizedEvent = validateEventData(rawEvent);

        if (!sanitizedEvent) {
          skipped++;
          logger.warn('Skipping invalid event:', rawEvent);
          continue;
        }

        // Verify project exists and is active
        let project;
        try {
          project = await Project.findOne({
            trackingId: sanitizedEvent.projectId,
            isActive: true
          }).lean();

          if (!project) {
            skipped++;
            logger.warn('Event for inactive/non-existent project:', sanitizedEvent.projectId);
            continue;
          }
        } catch (error) {
          skipped++;
          logger.error('Error validating project:', error.message);
          continue;
        }

        // Enrich event with user and geo data
        const enrichedEvent = {
          ...sanitizedEvent,
          projectId: project._id, // Use ObjectId instead of trackingId
          user: {
            ip: clientIP,
            userAgent: userAgent,
            browser: deviceInfo.browser?.name || 'Unknown',
            os: deviceInfo.os?.name || 'Unknown',
            device: deviceInfo.device?.type || 'desktop',
            country: geoInfo.country || 'Unknown',
            city: geoInfo.city || 'Unknown',
            region: geoInfo.region || 'Unknown'
          },
          metadata: {
            receivedAt: new Date(),
            userAgent: userAgent,
            ip: clientIP
          }
        };

        // Structure data for database
        const eventData = {
          projectId: enrichedEvent.projectId,
          sessionId: enrichedEvent.sessionId,
          type: enrichedEvent.type,
          timestamp: enrichedEvent.timestamp,
          user: enrichedEvent.user,
          metadata: enrichedEvent.metadata
        };

        // Add page data for pageview events
        if (enrichedEvent.page) {
          eventData.page = enrichedEvent.page;
        }

        // Store all other event-specific data in 'data' field
        const dataFields = { ...enrichedEvent };
        delete dataFields.projectId;
        delete dataFields.sessionId;
        delete dataFields.type;
        delete dataFields.timestamp;
        delete dataFields.user;
        delete dataFields.metadata;
        delete dataFields.page;

        eventData.data = dataFields;

        // Try to add to processing queue, fallback to direct save
        let queued = false;
        try {
          queued = await addEvent(eventData);
        } catch (queueError) {
          logger.warn('Queue not available, saving directly:', queueError.message);
        }

        // If queue is not available, save directly to database
        if (!queued) {
          try {
            const savedEvent = await Event.create(eventData);

            // Update session data
            await updateSessionData(eventData, savedEvent._id);

            logger.info('Event saved directly to database:', savedEvent._id);
          } catch (dbError) {
            logger.error('Error saving event directly:', dbError.message);
            skipped++;
            continue;
          }
        }

        processed++;

      } catch (error) {
        skipped++;
        logger.error('Error processing individual event:', error.message);
      }
    }

    logger.info(`Processed ${processed} events, skipped ${skipped} events`);

  } catch (error) {
    logger.error(`Tracking error: ${error.message}`);
    // Don't send error response as we already sent 202
  }
};

// Helper function to update session data
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

// Serve tracking script to client
export const serveTrackingScript = async (req, res) => {
  try {
    const { pid } = req.query;

    // Validate project ID
    if (!pid) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Verify project exists and is active
    const project = await Project.findOne({
      trackingId: pid,
      isActive: true
    }).lean();

    if (!project) {
      logger.warn('Request for invalid/inactive project:', pid);
      return res.status(404).json({ error: 'Invalid or inactive project ID' });
    }

    // Set appropriate headers for JavaScript file
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Vary', 'Accept-Encoding');

    // Send the tracking script
    res.sendFile('tracker.js', {
      root: './public',
      maxAge: '1h',
      etag: true,
      lastModified: true
    });

  } catch (error) {
    logger.error(`Error serving tracking script: ${error.message}`);
    res.status(500).json({ error: 'Failed to serve tracking script' });
  }
};