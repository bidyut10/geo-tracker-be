import UAParser from 'ua-parser-js';
import { logger } from './logger.js';

export const parseUserAgent = (userAgent) => {
  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: {
        name: result.browser.name || 'Unknown',
        version: result.browser.version || 'Unknown'
      },
      os: {
        name: result.os.name || 'Unknown',
        version: result.os.version || 'Unknown'
      },
      device: {
        type: result.device.type || 'desktop',
        model: result.device.model || 'Unknown',
        vendor: result.device.vendor || 'Unknown'
      },
      engine: {
        name: result.engine.name || 'Unknown',
        version: result.engine.version || 'Unknown'
      }
    };
  } catch (error) {
    logger.error(`Error parsing user agent: ${error.message}`);
    return {
      browser: { name: 'Unknown', version: 'Unknown' },
      os: { name: 'Unknown', version: 'Unknown' },
      device: { type: 'desktop', model: 'Unknown', vendor: 'Unknown' },
      engine: { name: 'Unknown', version: 'Unknown' }
    };
  }
}; 