import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['pageview', 'click', 'scroll', 'form', 'route', 'unload', 'custom']
  },
  timestamp: {
    type: Date,
    required: true
  },
  page: {
    url: String,
    title: String,
    referrer: String
  },
  user: {
    ip: String,
    userAgent: String,
    browser: String,
    os: String,
    device: String,
    country: String,
    city: String,
    region: String
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
eventSchema.index({ projectId: 1, timestamp: -1 });
eventSchema.index({ projectId: 1, type: 1, timestamp: -1 });
eventSchema.index({ sessionId: 1, timestamp: -1 });

// TTL index to automatically remove old events (30 days)
eventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Event = mongoose.model('Event', eventSchema); 