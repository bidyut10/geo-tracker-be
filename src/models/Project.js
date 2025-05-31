import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  domain: {
    type: String,
    required: true,
    trim: true
  },
  trackingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  settings: {
    trackClicks: {
      type: Boolean,
      default: true
    },
    trackScroll: {
      type: Boolean,
      default: true
    },
    trackForms: {
      type: Boolean,
      default: true
    },
    trackTimeOnPage: {
      type: Boolean,
      default: true
    },
    trackRouteChanges: {
      type: Boolean,
      default: true
    },
    excludeBots: {
      type: Boolean,
      default: true
    },
    sampleRate: {
      type: Number,
      default: 100,
      min: 1,
      max: 100
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
projectSchema.index({ userId: 1 });
projectSchema.index({ domain: 1 });

export const Project = mongoose.model('Project', projectSchema); 