import express from 'express';
import { generateId } from '@taka/utils';
import type { Project } from '@taka/types';

const router = express.Router();

// GET / — list all projects
router.get('/', async (req, res) => {
  try {
    const projects = await req.sessionService.listProjects();
    res.json({ projects, total: projects.length });
  } catch (error) {
    console.error('[Projects API] Failed to list projects:', error);
    res.status(500).json({
      error: 'Failed to retrieve projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST / — create a project
router.post('/', async (req, res) => {
  try {
    const { name, description, id } = req.body ?? {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        error: 'Invalid project',
        message: 'name is required',
      });
    }

    const projectId = id && typeof id === 'string' && id.trim() ? id.trim() : generateId();

    const existing = await req.sessionService.getProject(projectId);
    if (existing) {
      return res.status(409).json({
        error: 'Project exists',
        message: `A project with id "${projectId}" already exists`,
      });
    }

    const project: Project = {
      id: projectId,
      name: name.trim(),
      description: typeof description === 'string' ? description : undefined,
      createdAt: Date.now(),
    };

    await req.sessionService.createProject(project);
    res.status(201).json(project);
  } catch (error) {
    console.error('[Projects API] Failed to create project:', error);
    res.status(500).json({
      error: 'Failed to create project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /:projectId
router.get('/:projectId', async (req, res) => {
  try {
    const project = await req.sessionService.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `Project with id "${req.params.projectId}" does not exist`,
      });
    }
    res.json(project);
  } catch (error) {
    console.error('[Projects API] Failed to get project:', error);
    res.status(500).json({
      error: 'Failed to retrieve project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PATCH /:projectId — rename / update description
router.patch('/:projectId', async (req, res) => {
  try {
    const { name, description } = req.body ?? {};
    const updates: { name?: string; description?: string } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Invalid name' });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({ error: 'Invalid description' });
      }
      updates.description = description;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const ok = await req.sessionService.updateProject(req.params.projectId, updates);
    if (!ok) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await req.sessionService.getProject(req.params.projectId);
    res.json(project);
  } catch (error) {
    console.error('[Projects API] Failed to update project:', error);
    res.status(500).json({
      error: 'Failed to update project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /:projectId — cascade delete
router.delete('/:projectId', async (req, res) => {
  try {
    const deleted = await req.sessionService.deleteProject(req.params.projectId);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Projects API] Failed to delete project:', error);
    res.status(500).json({
      error: 'Failed to delete project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as projectRoutes };
