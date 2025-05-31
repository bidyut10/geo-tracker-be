import { Project } from '../models/Project.js';
import { logger } from '../utils/logger.js';
import { validationResult } from 'express-validator';
import crypto from 'crypto';

// Create new project
export const createProject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, domain } = req.body;
    const userId = req.user.id;

    // Generate unique tracking ID
    const trackingId = crypto.randomBytes(16).toString('hex');

    const project = new Project({
      name,
      domain,
      userId,
      trackingId
    });

    await project.save();

    res.status(201).json({
      message: 'Project created successfully',
      project: {
        id: project._id,
        name: project.name,
        domain: project.domain,
        trackingId: project.trackingId,
        trackingScript: `<script src="https://tracker-domain.com/api/track/t.js?pid=${project.trackingId}"></script>`
      }
    });
  } catch (error) {
    logger.error(`Error creating project: ${error.message}`);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

// Get all projects for user
export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user.id });
    
    const formattedProjects = projects.map(project => ({
      id: project._id,
      name: project.name,
      domain: project.domain,
      trackingId: project.trackingId,
      trackingScript: `<script src="https://tracker-domain.com/api/track/t.js?pid=${project.trackingId}"></script>`,
      isActive: project.isActive,
      createdAt: project.createdAt
    }));

    res.json(formattedProjects);
  } catch (error) {
    logger.error(`Error fetching projects: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get specific project
export const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      id: project._id,
      name: project.name,
      domain: project.domain,
      trackingId: project.trackingId,
      trackingScript: `<script src="https://tracker-domain.com/api/track/t.js?pid=${project.trackingId}"></script>`,
      settings: project.settings,
      isActive: project.isActive,
      createdAt: project.createdAt
    });
  } catch (error) {
    logger.error(`Error fetching project: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

// Update project
export const updateProject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates = req.body;
    Object.keys(updates).forEach(key => {
      project[key] = updates[key];
    });

    await project.save();

    res.json({
      message: 'Project updated successfully',
      project: {
        id: project._id,
        name: project.name,
        domain: project.domain,
        trackingId: project.trackingId,
        trackingScript: `<script src="https://tracker-domain.com/api/track/t.js?pid=${project.trackingId}"></script>`,
        settings: project.settings,
        isActive: project.isActive
      }
    });
  } catch (error) {
    logger.error(`Error updating project: ${error.message}`);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

// Delete project
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting project: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete project' });
  }
}; 