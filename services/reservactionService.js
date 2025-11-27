import redisClient from "../config/redis.js";
import { getCanteen } from "./canteenService.js";

const RESERVATION_COUNTER_KEY = 'reservation:id:counter';

/**
 * Get the 30-min slot keys affected by a reservation
 * For 30-min duration: 1 slot (the start time)
 * For 60-min duration: 2 slots (start time and start time + 30 min)
 */
function getAffectedSlotKeys(canteenId, date, time, duration) {
    const keys = [];
    const slotKey = `slot:${canteenId}:${date}:${time}`;
    keys.push(slotKey);

    if (parseInt(duration) === 60) {
        // Add the next 30-min slot
        const [hours, minutes] = time.split(':').map(Number);
        const nextMinutes = minutes + 30;
        const nextHours = hours + Math.floor(nextMinutes / 60);
        const nextTime = `${String(nextHours).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`;
        keys.push(`slot:${canteenId}:${date}:${nextTime}`);
    }

    return keys;
}

/**
 * Get the GLOBAL student slot keys (no canteenId - prevents booking same time at any canteen)
 */
function getStudentSlotKeys(date, time, duration) {
    const keys = [];
    const slotKey = `studentSlot:${date}:${time}`;
    keys.push(slotKey);

    if (parseInt(duration) === 60) {
        const [hours, minutes] = time.split(':').map(Number);
        const nextMinutes = minutes + 30;
        const nextHours = hours + Math.floor(nextMinutes / 60);
        const nextTime = `${String(nextHours).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`;
        keys.push(`studentSlot:${date}:${nextTime}`);
    }

    return keys;
}

/**
 * Check if a time falls within a meal period
 */
function isTimeInMealPeriod(workingHours, time) {
    for (const period of workingHours) {
        if (time >= period.from && time < period.to) {
            return true;
        }
    }
    return false;
}

/**
 * Validate that for 60-min duration, the end time also falls within meal period
 */
function isValidReservationTime(workingHours, time, duration) {
    if (!isTimeInMealPeriod(workingHours, time)) {
        return false;
    }

    if (parseInt(duration) === 60) {
        // Check that the slot only starts at even hours
        const [, minutes] = time.split(':').map(Number);
        if (minutes !== 0) {
            return false;
        }

        // Check that end time (start + 30 min) is also within meal period
        const [hours] = time.split(':').map(Number);
        const nextTime = `${String(hours).padStart(2, '0')}:30`;
        if (!isTimeInMealPeriod(workingHours, nextTime)) {
            return false;
        }
    }

    return true;
}

function validateReservationData(reservationData) {
    const { studentId, canteenId, date, time, duration } = reservationData;

    // Validate studentId
    if (studentId === undefined || studentId === null) {
        throw new Error('studentId is required');
    }
    const parsedStudentId = parseInt(studentId, 10);
    if (isNaN(parsedStudentId) || parsedStudentId < 1) {
        throw new Error('studentId must be a positive integer');
    }

    // Validate canteenId
    if (canteenId === undefined || canteenId === null) {
        throw new Error('canteenId is required');
    }
    const parsedCanteenId = parseInt(canteenId, 10);
    if (isNaN(parsedCanteenId) || parsedCanteenId < 1) {
        throw new Error('canteenId must be a positive integer');
    }

    // Validate date format (YYYY-MM-DD)
    if (!date || typeof date !== 'string') {
        throw new Error('date is required');
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        throw new Error('Invalid date format. Must be YYYY-MM-DD');
    }
    // Validate date is a real date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid date');
    }

    // Validate time format (HH:mm)
    if (!time || typeof time !== 'string') {
        throw new Error('time is required');
    }
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
        throw new Error('Invalid time format. Must be HH:mm');
    }

    // Validate duration
    if (duration === undefined || duration === null) {
        throw new Error('duration is required');
    }
    const parsedDuration = parseInt(duration, 10);
    if (parsedDuration !== 30 && parsedDuration !== 60) {
        throw new Error('duration must be 30 or 60');
    }

    // Validate 60-min slots start at even hours
    if (parsedDuration === 60) {
        const [, minutes] = time.split(':').map(Number);
        if (minutes !== 0) {
            throw new Error('60-minute reservations must start at even hours (e.g., 08:00, 09:00)');
        }
    }

    return {
        studentId: parsedStudentId,
        canteenId: parsedCanteenId,
        date,
        time,
        duration: parsedDuration
    };
}

export async function createReservation(reservationData) {
    const { canteenId, date, time, duration, studentId } = validateReservationData(reservationData);

    // Fetch canteen to get capacity and workingHours
    const canteen = await getCanteen(canteenId);
    if (!canteen) {
        throw new Error('Canteen not found');
    }
    // Check if user exists
    const studentKey = `student:${studentId}`;
    const studentExists = await redisClient.exists(studentKey);
    if (!studentExists) {
        throw new Error('Student not found');
    }
    // Validate date is not in the past
    const today = new Date();
    const reservationDate = new Date(`${date}T${time}:00`);

    if (reservationDate < today) {
        throw new Error('Reservation date and time cannot be in the past');
    }

    // Validate time is within working hours
    if (!isValidReservationTime(canteen.workingHours, time, duration)) {
        throw new Error('Invalid reservation time or duration');
    }

    const slotKeys = getAffectedSlotKeys(canteenId, date, time, duration);
    const studentSlotKeys = getStudentSlotKeys(date, time, duration);
    const capacity = canteen.capacity;

    // Use transaction to check capacity and create reservation atomically
    const multi = redisClient.multi();

    // Get current counts for all affected slots
    for (const key of slotKeys) {
        multi.get(key);
    }

    // Check if student already has reservation in any affected time slot (globally)
    for (const key of studentSlotKeys) {
        multi.sIsMember(key, String(studentId));
    }

    const results = await multi.exec();

    // Check if all slots have capacity, first N results are slot counts
    for (let i = 0; i < slotKeys.length; i++) {
        const count = parseInt(results[i] || '0', 10);
        if (count >= capacity) {
            throw new Error(`Slot ${slotKeys[i]} is fully booked`);
        }
    }
    // Check if student already has reservation in any affected time slot (globally)
    // Next N results are student slot membership checks
    for (let i = 0; i < studentSlotKeys.length; i++) {
        const isMember = results[slotKeys.length + i];
        if (isMember) {
            throw new Error('Student already has a reservation for this time slot');
        }
    }

    // Create reservation and increment slot counters in a transaction
    const createMulti = redisClient.multi();

    const id = await redisClient.incr(RESERVATION_COUNTER_KEY);
    const reservationKey = `reservation:${id}`;

    createMulti.hSet(reservationKey, {
        id: parseInt(id, 10),
        studentId: parseInt(reservationData.studentId, 10),
        canteenId: parseInt(canteenId, 10),
        date: date,
        time: time,
        duration: parseInt(duration, 10),
        status: 'Active',
        createdAt: new Date().toISOString()
    });

    // Increment all affected slot counters
    for (const key of slotKeys) {
        createMulti.incr(key);
    }
    // Add student to global slot sets
    for (const key of studentSlotKeys) {
        createMulti.sAdd(key, String(studentId));
    }

    await createMulti.exec();

    return { 
        id: parseInt(id, 10), 
        studentId: parseInt(reservationData.studentId, 10),
        date: date,
        time: time,
        duration: parseInt(duration, 10),
        canteenId: parseInt(canteenId, 10), 
        status: 'Active' };
}

export async function getReservationsByStudent(studentId, startDate, endDate) {
    if (!startDate || !endDate) {
        throw new Error('startDate and endDate are required');
    }
    const keys = await redisClient.keys('reservation:*');
    const reservations = [];
    for (const key of keys) {
        // Skip the counter key
        if (key === RESERVATION_COUNTER_KEY) continue;
        const reservation = await redisClient.hGetAll(key);
        if (reservation.studentId === String(studentId)) {
            // Filter by date range
            const resDate = reservation.date;
            if (resDate >= startDate && resDate <= endDate) {
                reservations.push({
                    id: parseInt(reservation.id, 10),
                    studentId: parseInt(reservation.studentId, 10),
                    canteenId: parseInt(reservation.canteenId, 10),
                    date: reservation.date,
                    time: reservation.time,
                    duration: parseInt(reservation.duration, 10),
                    status: reservation.status
                });
            }
        }
    }

    // Sort by date and time
    reservations.sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
        return a.time.localeCompare(b.time);
    });
    return reservations;
}

export async function deleteReservation(reservationId, studentId) {
    const reservationKey = `reservation:${reservationId}`;
    const reservation = await redisClient.hGetAll(reservationKey);
    if (Object.keys(reservation).length === 0) {
        return null;
    }
    if (reservation.studentId !== studentId) {
        return null;
    }
    if (reservation.status === 'Cancelled') {
        return null; // Already cancelled
    }

    const slotKeys = getAffectedSlotKeys(
        reservation.canteenId,
        reservation.date,
        reservation.time,
        reservation.duration
    );

    const studentSlotKeys = getStudentSlotKeys(
        reservation.date,
        reservation.time,
        reservation.duration
    );

    // Use transaction to cancel reservation, decrement slot counters and remove student from sets
    const multi = redisClient.multi();

    multi.hSet(reservationKey, 'status', 'Cancelled');

    // Decrement all affected slot counters
    for (const key of slotKeys) {
        multi.decr(key);
    }

    // Remove student from global slot sets
    for (const key of studentSlotKeys) {
        multi.sRem(key, String(studentId));
    }

    await multi.exec();

    const updatedReservation = await redisClient.hGetAll(reservationKey);
    return {
        id: parseInt(updatedReservation.id, 10),
        status: updatedReservation.status,
        studentId: parseInt(updatedReservation.studentId, 10),
        canteenId: parseInt(updatedReservation.canteenId, 10),
        date: updatedReservation.date,
        time: updatedReservation.time,
        duration: parseInt(updatedReservation.duration, 10)
    };
}