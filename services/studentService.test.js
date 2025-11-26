import { jest } from '@jest/globals';

// Mock Redis client
const mockRedisClient = {
    hGet: jest.fn(),
    hSet: jest.fn(),
    hGetAll: jest.fn(),
    incr: jest.fn()
};

// Mock the modules before importing
jest.unstable_mockModule('../config/redis.js', () => ({
    default: mockRedisClient
}));

// Import after mocking
const { createStudent, getStudent } = await import('./studentService.js');

describe('studentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisClient.incr.mockResolvedValue(1);
        mockRedisClient.hSet.mockResolvedValue(1);
        mockRedisClient.hGet.mockResolvedValue(null); // No existing email by default
    });

    describe('createStudent', () => {
        it('should create student successfully', async () => {
            const studentData = {
                name: 'John Doe',
                email: 'john@example.com',
                isAdmin: false
            };

            const result = await createStudent(studentData);

            expect(result).toMatchObject({
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                isAdmin: false
            });
            expect(mockRedisClient.hSet).toHaveBeenCalledTimes(2); // student + email index
        });

        it('should create admin student', async () => {
            const studentData = {
                name: 'Admin User',
                email: 'admin@example.com',
                isAdmin: true
            };

            const result = await createStudent(studentData);

            expect(result).toMatchObject({
                id: 1,
                name: 'Admin User',
                email: 'admin@example.com',
                isAdmin: true
            });
            expect(mockRedisClient.hSet).toHaveBeenCalledWith(
                'student:1',
                expect.objectContaining({ isAdmin: 'true' })
            );
        });

        it('should reject duplicate email', async () => {
            mockRedisClient.hGet.mockResolvedValue('42'); // Email already exists

            const studentData = {
                name: 'John Doe',
                email: 'existing@example.com',
                isAdmin: false
            };

            await expect(createStudent(studentData))
                .rejects.toThrow('Email already in use');
        });

        it('should reject invalid email format - missing @', async () => {
            const studentData = {
                name: 'John Doe',
                email: 'invalid-email',
                isAdmin: false
            };

            await expect(createStudent(studentData))
                .rejects.toThrow('Invalid email format');
        });

        it('should reject invalid email format - missing domain', async () => {
            const studentData = {
                name: 'John Doe',
                email: 'john@',
                isAdmin: false
            };

            await expect(createStudent(studentData))
                .rejects.toThrow('Invalid email format');
        });

        it('should reject invalid email format - missing TLD', async () => {
            const studentData = {
                name: 'John Doe',
                email: 'john@example',
                isAdmin: false
            };

            await expect(createStudent(studentData))
                .rejects.toThrow('Invalid email format');
        });

        it('should reject invalid email format - spaces', async () => {
            const studentData = {
                name: 'John Doe',
                email: 'john doe@example.com',
                isAdmin: false
            };

            await expect(createStudent(studentData))
                .rejects.toThrow('Invalid email format');
        });

        it('should accept valid email formats', async () => {
            const validEmails = [
                'test@example.com',
                'user.name@domain.org',
                'user+tag@example.co.uk'
            ];

            for (const email of validEmails) {
                jest.clearAllMocks();
                mockRedisClient.hGet.mockResolvedValue(null);
                mockRedisClient.incr.mockResolvedValue(1);

                const result = await createStudent({
                    name: 'Test',
                    email,
                    isAdmin: false
                });

                expect(result.email).toBe(email);
            }
        });
    });

    describe('getStudent', () => {
        it('should return student when found', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({
                id: '1',
                name: 'John Doe',
                email: 'john@example.com',
                isAdmin: 'false'
            });

            const result = await getStudent('1');

            expect(result).toMatchObject({
                id: 1,
                name: 'John Doe',
                email: 'john@example.com',
                isAdmin: false
            });
        });

        it('should return student with isAdmin true', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({
                id: '1',
                name: 'Admin User',
                email: 'admin@example.com',
                isAdmin: 'true'
            });

            const result = await getStudent('1');

            expect(result).toMatchObject({
                id: 1,
                name: 'Admin User',
                email: 'admin@example.com',
                isAdmin: true
            });
        });

        it('should return null when student not found', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({});

            const result = await getStudent('999');

            expect(result).toBeNull();
        });

        it('should parse id as integer', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({
                id: '42',
                name: 'John Doe',
                email: 'john@example.com',
                isAdmin: 'false'
            });

            const result = await getStudent('42');

            expect(result.id).toBe(42);
            expect(typeof result.id).toBe('number');
        });
    });
});
