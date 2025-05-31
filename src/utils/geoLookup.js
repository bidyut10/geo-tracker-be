import { logger } from './logger.js';

export const getGeoInfo = async (ip) => {
  try {
    // Skip lookup for localhost and private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return {
        country: 'Local',
        city: 'Local',
        region: 'Local',
        latitude: null,
        longitude: null
      };
    }

    const response = await fetch(`${process.env.IPWHO_API}${ip}`);
    
    if (!response.ok) {
      throw new Error(`IP lookup failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      country: data.country || 'Unknown',
      city: data.city || 'Unknown',
      region: data.region || 'Unknown',
      latitude: data.latitude || null,
      longitude: data.longitude || null
    };
  } catch (error) {
    logger.error(`Geo lookup error for IP ${ip}: ${error.message}`);
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      latitude: null,
      longitude: null
    };
  }
}; 