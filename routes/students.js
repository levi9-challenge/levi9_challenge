import express from 'express';
import { createStudent, getStudent } from '../services/studentService.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const student = await createStudent(req.body);
        res.status(201).json(student);
    } catch (err) {
        if (err.message === 'Invalid email format' || err.message === 'Email already in use') {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const student = await getStudent(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (err) {
        // Redis connection or unexpected error
        res.status(500).json({ error: err.message });
    }
});

export default router;