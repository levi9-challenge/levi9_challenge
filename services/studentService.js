import redisClient from "../config/redis.js";

const STUDENT_COUNTER_KEY = 'student:id:counter';
const STUDENT_EMAIL_INDEX = 'student:email:index';

export async function createStudent(studentData) {
    // Validate required fields exist
    if (!studentData.name || typeof studentData.name !== 'string') {
        throw new Error('Name is required');
    }
    if (!studentData.email || typeof studentData.email !== 'string') {
        throw new Error('Email is required');
    }
    // Validate name length
    const trimmedName = studentData.name.trim();
    if (trimmedName.length < 1) {
        throw new Error('Name cannot be empty');
    }
    if (trimmedName.length > 100) {
        throw new Error('Name cannot exceed 100 characters');
    }
    // check if email aleady exists
    const existingId = await redisClient.hGet(STUDENT_EMAIL_INDEX, studentData.email);
    if (existingId) {
        throw new Error('Email already in use');
    }
    // validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(studentData.email)) {
        throw new Error('Invalid email format');
    }
    // Should continue with ZeroBounce or similar email validation service in production

    const id = await redisClient.incr(STUDENT_COUNTER_KEY);
    const studentKey = `student:${id}`;
    
    await redisClient.hSet(studentKey, {
        id: id,
        name: studentData.name,
        email: studentData.email,
        isAdmin: studentData.isAdmin ? 'true' : 'false'
    });

    await redisClient.hSet(STUDENT_EMAIL_INDEX, studentData.email, id);

    return { id, ...studentData };
}

export async function getStudent(id) {
    const student = await redisClient.hGetAll(`student:${id}`);
    if (Object.keys(student).length === 0) {
        return null;
    }
    return {
        id: parseInt(student.id, 10),
        name: student.name,
        email: student.email,
        isAdmin: student.isAdmin === 'true',
    };
}