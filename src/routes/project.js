import express from 'express';
import { body } from 'express-validator';
import { createProject, getProjects, getProject, updateProject, deleteProject } from '../controllers/projectController.js';
import { auth } from '../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Create new project
router.post('/',
  [
    body('name').trim().notEmpty(),
    body('domain').trim().notEmpty()
  ],
  createProject
);

// Get all projects for user
router.get('/', getProjects);

// Get specific project
router.get('/:id', getProject);

// Update project
router.put('/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('domain').optional().trim().notEmpty(),
    body('settings').optional().isObject()
  ],
  updateProject
);

// Delete project
router.delete('/:id', deleteProject);

export default router; 