import redisClient from "../config/redis.js";
import { getStudent } from "./studentService.js";

const CANTEEN_COUNTER_KEY = 'canteen:id:counter';

/**
 * Get the meal name for a given time based on workingHours
 */
function getMealForTime(workingHours, time) {
    for (const period of workingHours) {
        if (time >= period.from && time < period.to) {
            return period.meal;
        }
    }
    return null;
}

/**
 * Generate all time slots between start and end times for a single date
 * For 30-min duration: every 30-min slot
 * For 60-min duration: only slots starting at even hours (:00)
 */
function generateTimeSlotsForDate(date, startTime, endTime, duration, workingHours) {
    const slots = [];
    const durationMin = parseInt(duration);

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentHour = startHour;
    let currentMinute = startMinute;

    const endTotalMinutes = endHour * 60 + endMinute;

    while (true) {
        const currentTotalMinutes = currentHour * 60 + currentMinute;

        // For 60-min slots, we need the next 30-min slot to exist
        const slotEndMinutes = currentTotalMinutes + durationMin;

        if (slotEndMinutes > endTotalMinutes) {
            break;
        }

        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        const meal = getMealForTime(workingHours, timeStr);

        // Only include slots that fall within a meal period
        if (meal) {
            // For 60-min duration, check that the second 30-min slot is also in the meal period
            if (durationMin === 60) {
                const nextTime = `${String(currentHour).padStart(2, '0')}:30`;
                const nextMeal = getMealForTime(workingHours, nextTime);
                if (nextMeal === meal) {
                    slots.push({ date, time: timeStr, meal });
                }
            } else {
                slots.push({ date, time: timeStr, meal });
            }
        }

        // Move to next slot
        if (durationMin === 60) {
            // 60-min slots only start at even hours
            currentHour += 1;
            currentMinute = 0;
        } else {
            // 30-min slots advance by 30 minutes
            currentMinute += 30;
            if (currentMinute >= 60) {
                currentMinute = 0;
                currentHour += 1;
            }
        }
    }

    return slots;
}

/**
 * Generate all time slots in a date/time range
 */
function generateTimeSlots(startDate, startTime, endDate, endTime, duration, workingHours) {
    const slots = [];
    const durationMin = parseInt(duration);

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];

        // Determine time range for this date
        const dayStartTime = dateStr === startDate ? startTime : '00:00';
        const dayEndTime = dateStr === endDate ? endTime : '23:59';

        const daySlots = generateTimeSlotsForDate(dateStr, dayStartTime, dayEndTime, durationMin, workingHours);
        slots.push(...daySlots);
    }

    return slots;
}

/**
 * Get canteen status with available slots
 */
export async function getCanteenStatus(canteenId, startDate, startTime, endDate, endTime, duration) {
    const canteen = await getCanteen(canteenId);
    if (!canteen) {
        return null;
    }

    const durationMin = parseInt(duration);
    const slots = generateTimeSlots(startDate, startTime, endDate, endTime, durationMin, canteen.workingHours);

    // Fetch current counts for all slots
    const result = [];

    for (const slot of slots) {
        const slotKey = `slot:${canteenId}:${slot.date}:${slot.time}`;

        if (durationMin === 60) {
            // For 60-min slots, get both 30-min slot counts
            const [hours] = slot.time.split(':').map(Number);
            const nextTime = `${String(hours).padStart(2, '0')}:30`;
            const nextSlotKey = `slot:${canteenId}:${slot.date}:${nextTime}`;

            const [count1, count2] = await Promise.all([
                redisClient.get(slotKey),
                redisClient.get(nextSlotKey)
            ]);

            const used1 = parseInt(count1 || '0', 10);
            const used2 = parseInt(count2 || '0', 10);
            const remainingCapacity = canteen.capacity - Math.max(used1, used2);

            result.push({
                date: slot.date,
                meal: slot.meal,
                startTime: slot.time,
                remainingCapacity: Math.max(0, remainingCapacity)
            });
        } else {
            // For 30-min slots
            const count = await redisClient.get(slotKey);
            const used = parseInt(count || '0', 10);
            const remainingCapacity = canteen.capacity - used;

            result.push({
                date: slot.date,
                meal: slot.meal,
                startTime: slot.time,
                remainingCapacity: Math.max(0, remainingCapacity)
            });
        }
    }

    return { slots: result };
}

/**
 * Get status for all canteens
 */
export async function getAllCanteensStatus(startDate, startTime, endDate, endTime, duration) {
    const canteens = await getAllCanteens();
    const results = [];

    for (const canteen of canteens) {
        const status = await getCanteenStatus(canteen.id, startDate, startTime, endDate, endTime, duration);
        results.push({
            canteenId: canteen.id,
            name: canteen.name,
            slots: status.slots
        });
    }

    return results;
}

async function checkAdminStudent(studentId) {
    // Chack if student creating the canteen is admin
    const student = await getStudent(studentId);
    if (!student || !student.isAdmin) {
        throw new Error('Only admin students can create canteens');
    }
}

function validateCanteenData(canteenData) {
    // Validate name
    if (!canteenData.name || typeof canteenData.name !== 'string') {
        throw new Error('Name is required');
    }
    const trimmedName = canteenData.name.trim();
    if (trimmedName.length < 1) {
        throw new Error('Name cannot be empty');
    }
    if (trimmedName.length > 100) {
        throw new Error('Name cannot exceed 100 characters');
    }

    // Validate location
    if (!canteenData.location || typeof canteenData.location !== 'string') {
        throw new Error('Location is required');
    }
    const trimmedLocation = canteenData.location.trim();
    if (trimmedLocation.length < 1) {
        throw new Error('Location cannot be empty');
    }
    if (trimmedLocation.length > 200) {
        throw new Error('Location cannot exceed 200 characters');
    }

    // Validate capacity
    if (canteenData.capacity === undefined || canteenData.capacity === null) {
        throw new Error('Capacity is required');
    }
    const capacity = parseInt(canteenData.capacity, 10);
    if (isNaN(capacity) || capacity < 1) {
        throw new Error('Capacity must be a positive integer');
    }
    if (capacity > 10000) {
        throw new Error('Capacity cannot exceed 10000');
    }

    // Validate workingHours
    if (!canteenData.workingHours || !Array.isArray(canteenData.workingHours)) {
        throw new Error('Working hours are required and must be an array');
    }
    if (canteenData.workingHours.length === 0) {
        throw new Error('At least one working hours period is required');
    }

    const validMeals = ['breakfast', 'lunch', 'dinner'];
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm format

    for (const period of canteenData.workingHours) {
        // Validate meal name
        if (!period.meal || typeof period.meal !== 'string') {
            throw new Error('Each working hours period must have a meal name');
        }
        if (!validMeals.includes(period.meal.toLowerCase())) {
            throw new Error(`Invalid meal type: ${period.meal}. Must be breakfast, lunch, or dinner`);
        }

        // Validate from time
        if (!period.from || typeof period.from !== 'string') {
            throw new Error('Each working hours period must have a from time');
        }
        if (!timeRegex.test(period.from)) {
            throw new Error(`Invalid from time format: ${period.from}. Must be HH:mm`);
        }

        // Validate to time
        if (!period.to || typeof period.to !== 'string') {
            throw new Error('Each working hours period must have a to time');
        }
        if (!timeRegex.test(period.to)) {
            throw new Error(`Invalid to time format: ${period.to}. Must be HH:mm`);
        }

        // Validate from < to
        if (period.from >= period.to) {
            throw new Error(`Working hours 'from' (${period.from}) must be before 'to' (${period.to})`);
        }

        // Validate minimum 30-min duration
        const [fromHour, fromMin] = period.from.split(':').map(Number);
        const [toHour, toMin] = period.to.split(':').map(Number);
        const durationMinutes = (toHour * 60 + toMin) - (fromHour * 60 + fromMin);
        if (durationMinutes < 30) {
            throw new Error('Each working hours period must be at least 30 minutes');
        }
    }

    // Check for overlapping periods
    const sortedPeriods = [...canteenData.workingHours].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 0; i < sortedPeriods.length - 1; i++) {
        if (sortedPeriods[i].to > sortedPeriods[i + 1].from) {
            throw new Error('Working hours periods cannot overlap');
        }
    }

    return {
        name: trimmedName,
        location: trimmedLocation,
        capacity: capacity,
        workingHours: canteenData.workingHours,
        createdBy: canteenData.createdBy
    };
}

export async function createCanteen(canteenData) {
    const validatedData = validateCanteenData(canteenData);
    const id = await redisClient.incr(CANTEEN_COUNTER_KEY);
    const canteenKey = `canteen:${id}`;

    // Chack if student creating the canteen is admin
    await checkAdminStudent(validatedData.createdBy);

    await redisClient.hSet(canteenKey, {
        id: id.toString(),
        name: validatedData.name,
        location: validatedData.location,
        capacity: validatedData.capacity,
        workingHours: JSON.stringify(validatedData.workingHours),
        createdBy: validatedData.createdBy,
        createdAt: new Date().toISOString()
    });
    const { createdBy, createdAt, ...publicData } = validatedData;
    return { id, ...publicData };
}

function sanitizeCanteen(canteen) {
    return {
        id: parseInt(canteen.id, 10),
        name: canteen.name,
        location: canteen.location,
        capacity: parseInt(canteen.capacity, 10),
        workingHours: JSON.parse(canteen.workingHours)
    };
}

export async function getAllCanteens() {
    const canteenIds = await redisClient.keys('canteen:*');
    const canteens = [];
    for (const key of canteenIds) {
        if (key === CANTEEN_COUNTER_KEY) continue;
        const canteen = await redisClient.hGetAll(key);
        canteens.push(sanitizeCanteen(canteen));
    }
    return canteens;
}

export async function getCanteen(id) {
    const canteen = await redisClient.hGetAll(`canteen:${id}`);
    if (Object.keys(canteen).length === 0) {
        return null;
    }
    return {
        id: parseInt(canteen.id, 10),
        name: canteen.name,
        location: canteen.location,
        capacity: parseInt(canteen.capacity, 10),
        workingHours: JSON.parse(canteen.workingHours)
    };
}

function validateCanteenUpdateData(updateData) {
    const validated = {};

    // Validate name if provided
    if (updateData.name !== undefined) {
        if (typeof updateData.name !== 'string') {
            throw new Error('Name must be a string');
        }
        const trimmedName = updateData.name.trim();
        if (trimmedName.length < 1) {
            throw new Error('Name cannot be empty');
        }
        if (trimmedName.length > 100) {
            throw new Error('Name cannot exceed 100 characters');
        }
        validated.name = trimmedName;
    }

    // Validate location if provided
    if (updateData.location !== undefined) {
        if (typeof updateData.location !== 'string') {
            throw new Error('Location must be a string');
        }
        const trimmedLocation = updateData.location.trim();
        if (trimmedLocation.length < 1) {
            throw new Error('Location cannot be empty');
        }
        if (trimmedLocation.length > 200) {
            throw new Error('Location cannot exceed 200 characters');
        }
        validated.location = trimmedLocation;
    }

    // Validate capacity if provided
    if (updateData.capacity !== undefined) {
        const capacity = parseInt(updateData.capacity, 10);
        if (isNaN(capacity) || capacity < 1) {
            throw new Error('Capacity must be a positive integer');
        }
        if (capacity > 10000) {
            throw new Error('Capacity cannot exceed 10000');
        }
        validated.capacity = capacity;
    }

    // Validate workingHours if provided
    if (updateData.workingHours !== undefined) {
        if (!Array.isArray(updateData.workingHours)) {
            throw new Error('Working hours must be an array');
        }
        if (updateData.workingHours.length === 0) {
            throw new Error('At least one working hours period is required');
        }

        const validMeals = ['breakfast', 'lunch', 'dinner'];
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

        for (const period of updateData.workingHours) {
            if (!period.meal || typeof period.meal !== 'string') {
                throw new Error('Each working hours period must have a meal name');
            }
            if (!validMeals.includes(period.meal.toLowerCase())) {
                throw new Error(`Invalid meal type: ${period.meal}. Must be breakfast, lunch, or dinner`);
            }

            if (!period.from || typeof period.from !== 'string') {
                throw new Error('Each working hours period must have a from time');
            }
            if (!timeRegex.test(period.from)) {
                throw new Error(`Invalid from time format: ${period.from}. Must be HH:mm`);
            }

            if (!period.to || typeof period.to !== 'string') {
                throw new Error('Each working hours period must have a to time');
            }
            if (!timeRegex.test(period.to)) {
                throw new Error(`Invalid to time format: ${period.to}. Must be HH:mm`);
            }

            if (period.from >= period.to) {
                throw new Error(`Working hours 'from' (${period.from}) must be before 'to' (${period.to})`);
            }

            const [fromHour, fromMin] = period.from.split(':').map(Number);
            const [toHour, toMin] = period.to.split(':').map(Number);
            const durationMinutes = (toHour * 60 + toMin) - (fromHour * 60 + fromMin);
            if (durationMinutes < 30) {
                throw new Error('Each working hours period must be at least 30 minutes');
            }
        }

        const sortedPeriods = [...updateData.workingHours].sort((a, b) => a.from.localeCompare(b.from));
        for (let i = 0; i < sortedPeriods.length - 1; i++) {
            if (sortedPeriods[i].to > sortedPeriods[i + 1].from) {
                throw new Error('Working hours periods cannot overlap');
            }
        }

        validated.workingHours = JSON.stringify(updateData.workingHours);
    }

    // Return null if no valid fields provided
    if (Object.keys(validated).length === 0) {
        throw new Error('At least one field to update is required');
    }

    return validated;
}


export async function updateCanteen(id, updateData, updatedBy) {
    const canteenKey = `canteen:${id}`;
    await checkAdminStudent(updatedBy);
    const existingCanteen = await redisClient.hGetAll(canteenKey);
    if (Object.keys(existingCanteen).length === 0) {
        return null;
    }
    const validatedData = validateCanteenUpdateData(updateData);
    const updatedCanteen = { ...existingCanteen, ...validatedData };
    await redisClient.hSet(canteenKey, updatedCanteen);
    return updatedCanteen;
}

export async function deleteCanteen(id, deletedBy) {
    const canteenKey = `canteen:${id}`;
    await checkAdminStudent(deletedBy);
    const result = await redisClient.del(canteenKey);
    return result === 1;
}