import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

export const generateToken = (userId) => {
  try {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  } catch (error) {
    logger.error(`Token generation error: ${error.message}`);
    throw new Error('Failed to generate token');
  }
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    logger.error(`Token verification error: ${error.message}`);
    throw error;
  }
}; 