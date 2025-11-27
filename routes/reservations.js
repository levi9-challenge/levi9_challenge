import express from 'express';
import { createReservation, deleteReservation, getReservationsByStudent } from '../services/reservactionService.js';

const router = express.Router();

function isValidationError(message) {
    const validationPhrases = [
        'is required',
        'must be',
        'Invalid',
        'cannot be in the past',
        'already has a reservation',
        'fully booked'
    ];
    return validationPhrases.some(phrase => message.includes(phrase));
}

function isNotFoundError(message) {
    return message.includes('not found');
}

router.get('/', async (req, res) => {
    try {
        const studentId = req.headers['studentid'];
        const { startDate, endDate } = req.query;
        if (!studentId) {
            return res.status(400).json({ error: 'Missing studentId header' });
        }
        const reservations = await getReservationsByStudent(studentId, startDate, endDate);
        res.status(200).json(reservations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/', async (req, res) => {
    try {
        const reservation = await createReservation(req.body);
        res.status(201).json(reservation);
    } catch (err) {
        if (isNotFoundError(err.message)) {
            return res.status(404).json({ error: err.message });
        }
        if (isValidationError(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const studentId = req.headers['studentid'];
        if (!studentId) {
            return res.status(400).json({ error: 'Missing studentId header' });
        }
        const deletedReservation = await deleteReservation(req.params.id, studentId);
        if (!deletedReservation) {
            return res.status(404).json({ error: 'Reservation not found or unauthorized' });
        }
        res.json(deletedReservation);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;