import { logger } from '../utils/logger.js';

// Common bot user agent patterns
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /slurp/i,
  /search/i,
  /wget/i,
  /curl/i,
  /python/i,
  /java/i,
  /ruby/i,
  /perl/i,
  /php/i,
  /go-http/i,
  /apache/i,
  /nginx/i,
  /monitoring/i,
  /uptime/i,
  /pingdom/i,
  /newrelic/i,
  /datadog/i,
  /grafana/i,
  /prometheus/i,
  /zabbix/i,
  /nagios/i,
  /headless/i,
  /phantom/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /cypress/i
];

export const botFilter = (req, res, next) => {
  const userAgent = req.headers['user-agent'];
  
  if (!userAgent) {
    logger.warn('Request without User-Agent header');
    return res.status(400).json({ error: 'User-Agent header required' });
  }

  // Check if user agent matches any bot pattern
  const isBot = BOT_PATTERNS.some(pattern => pattern.test(userAgent));

  if (isBot) {
    logger.info(`Bot traffic detected: ${userAgent}`);
    return res.status(403).json({ error: 'Bot traffic not allowed' });
  }

  next();
}; 