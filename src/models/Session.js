import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number 
  },
  pageViews: {
    type: Number,
    default: 0
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
  firstPage: {
    url: String,
    title: String,
    referrer: String
  },
  lastPage: {
    url: String,
    title: String
  },
  isBounce: {
    type: Boolean,
    default: true
  },
  events: {
    clicks: { type: Number, default: 0 },
    scrolls: { type: Number, default: 0 },
    forms: { type: Number, default: 0 },
    routes: { type: Number, default: 0 }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for common queries
sessionSchema.index({ projectId: 1, startTime: -1 });
sessionSchema.index({ projectId: 1, 'user.country': 1, startTime: -1 });
sessionSchema.index({ projectId: 1, 'user.device': 1, startTime: -1 });

// TTL index to automatically remove old sessions (90 days)
sessionSchema.index({ startTime: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Session = mongoose.model('Session', sessionSchema); 