import express from 'express';
import { createCanteen, getCanteen, getAllCanteens, updateCanteen, deleteCanteen, getCanteenStatus, getAllCanteensStatus } from '../services/canteenService.js';

const router = express.Router();

function isValidationError(message) {
    const validationPhrases = [
        'is required',
        'cannot be empty',
        'cannot exceed',
        'must be',
        'Invalid',
        'cannot overlap',
        'At least one'
    ];
    return validationPhrases.some(phrase => message.includes(phrase));
}

function isPermissionError(message) {
    return message.includes('Only admin');
}

router.post('/', async (req, res) => {
    try {
        const createdBy = req.headers['studentid'];
        if (!createdBy) {
            return res.status(400).json({ error: 'Missing studentId header' });
        }
        const canteen = await createCanteen({ ...req.body, createdBy });
        res.status(201).json(canteen);
    } catch (err) {
        if (isValidationError(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        if (isPermissionError(err.message)) {
            return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const canteens = await getAllCanteens();
        res.json(canteens);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/status', async (req, res) => {
    try {
        const { startDate, startTime, endDate, endTime, duration } = req.query;

        if (!startDate || !startTime || !endDate || !endTime || !duration) {
            return res.status(400).json({ error: 'Missing required query parameters: startDate, startTime, endDate, endTime, duration' });
        }

        if (!['30', '60'].includes(duration)) {
            return res.status(400).json({ error: 'Duration must be 30 or 60' });
        }

        const results = await getAllCanteensStatus(startDate, startTime, endDate, endTime, duration);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const canteen = await getCanteen(req.params.id);
        if (!canteen) return res.status(404).json({ error: 'Canteen not found' });
        res.json(canteen);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/status', async (req, res) => {
    try {
        const { startDate, startTime, endDate, endTime, duration } = req.query;

        if (!startDate || !startTime || !endDate || !endTime || !duration) {
            return res.status(400).json({ error: 'Missing required query parameters: startDate, startTime, endDate, endTime, duration' });
        }

        if (!['30', '60'].includes(duration)) {
            return res.status(400).json({ error: 'Duration must be 30 or 60' });
        }

        const status = await getCanteenStatus(req.params.id, startDate, startTime, endDate, endTime, duration);
        if (!status) return res.status(404).json({ error: 'Canteen not found' });
        res.json({ canteenId: parseInt(req.params.id, 10), ...status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const updatedBy = req.headers['studentid'];
        if (!updatedBy) {
            return res.status(400).json({ error: 'Missing studentId header' });
        }
        const updatedCanteen = await updateCanteen(req.params.id, req.body, updatedBy);
        if (!updatedCanteen) return res.status(404).json({ error: 'Canteen not found' });
        res.json(updatedCanteen);
    } catch (err) {
        if (isValidationError(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        if (isPermissionError(err.message)) {
            return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const deletedBy = req.headers['studentid'];
        if (!deletedBy) {
            return res.status(400).json({ error: 'Missing studentId header' });
        }
        const success = await deleteCanteen(req.params.id, deletedBy);
        if (!success) return res.status(404).json({ error: 'Canteen not found' });
        res.status(204).end();
    } catch (err) {
        if (isPermissionError(err.message)) {
            return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

export default router;