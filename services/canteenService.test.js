import { jest } from '@jest/globals';

// Mock Redis client
const mockRedisClient = {
    incr: jest.fn(),
    hSet: jest.fn(),
    hGetAll: jest.fn(),
    keys: jest.fn(),
    del: jest.fn(),
    get: jest.fn()
};

// Mock student service
const mockGetStudent = jest.fn();

// Mock the modules before importing
jest.unstable_mockModule('../config/redis.js', () => ({
    default: mockRedisClient
}));

jest.unstable_mockModule('./studentService.js', () => ({
    getStudent: mockGetStudent
}));

// Import after mocking
const { 
    createCanteen, 
    getCanteen, 
    getAllCanteens, 
    updateCanteen, 
    deleteCanteen,
    getCanteenStatus,
    getAllCanteensStatus
} = await import('./canteenService.js');

describe('canteenService', () => {
    const mockAdminStudent = {
        id: 1,
        name: 'Admin User',
        email: 'admin@test.com',
        isAdmin: true
    };

    const mockRegularStudent = {
        id: 2,
        name: 'Regular User',
        email: 'user@test.com',
        isAdmin: false
    };

    const mockCanteenData = {
        name: 'Main Canteen',
        location: 'Building A',
        capacity: 30,
        workingHours: [
            { meal: 'breakfast', from: '08:00', to: '10:00' },
            { meal: 'lunch', from: '11:00', to: '13:00' }
        ],
        createdBy: '1'
    };

    const mockStoredCanteen = {
        id: '1',
        name: 'Main Canteen',
        location: 'Building A',
        capacity: '30',
        workingHours: JSON.stringify([
            { meal: 'breakfast', from: '08:00', to: '10:00' },
            { meal: 'lunch', from: '11:00', to: '13:00' }
        ]),
        createdBy: '1',
        createdAt: '2025-11-26T10:00:00.000Z'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetStudent.mockResolvedValue(mockAdminStudent);
        mockRedisClient.incr.mockResolvedValue(1);
        mockRedisClient.hSet.mockResolvedValue(1);
        mockRedisClient.del.mockResolvedValue(1);
    });

    describe('createCanteen', () => {
        it('should create canteen when user is admin', async () => {
            mockGetStudent.mockResolvedValue(mockAdminStudent);

            const result = await createCanteen(mockCanteenData);

            expect(result).toMatchObject({
                id: 1,
                name: 'Main Canteen',
                location: 'Building A',
                capacity: 30
            });
            expect(result.workingHours).toHaveLength(2);
            expect(mockRedisClient.hSet).toHaveBeenCalled();
        });

        it('should reject canteen creation when user is not admin', async () => {
            mockGetStudent.mockResolvedValue(mockRegularStudent);

            await expect(createCanteen({ ...mockCanteenData, createdBy: '2' }))
                .rejects.toThrow('Only admin students can create canteens');
        });

        it('should reject canteen creation when user not found', async () => {
            mockGetStudent.mockResolvedValue(null);

            await expect(createCanteen(mockCanteenData))
                .rejects.toThrow('Only admin students can create canteens');
        });
    });

    describe('getCanteen', () => {
        it('should return canteen when found', async () => {
            mockRedisClient.hGetAll.mockResolvedValue(mockStoredCanteen);

            const result = await getCanteen('1');

            expect(result).toMatchObject({
                id: 1,
                name: 'Main Canteen',
                location: 'Building A',
                capacity: 30
            });
            expect(result.workingHours).toHaveLength(2);
        });

        it('should return null when canteen not found', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({});

            const result = await getCanteen('999');

            expect(result).toBeNull();
        });
    });

    describe('getAllCanteens', () => {
        it('should return all canteens', async () => {
            mockRedisClient.keys.mockResolvedValue(['canteen:1', 'canteen:2', 'canteen:id:counter']);
            mockRedisClient.hGetAll
                .mockResolvedValueOnce(mockStoredCanteen)
                .mockResolvedValueOnce({
                    ...mockStoredCanteen,
                    id: '2',
                    name: 'Second Canteen'
                });

            const result = await getAllCanteens();

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('Main Canteen');
            expect(result[1].name).toBe('Second Canteen');
        });

        it('should return empty array when no canteens exist', async () => {
            mockRedisClient.keys.mockResolvedValue(['canteen:id:counter']);

            const result = await getAllCanteens();

            expect(result).toHaveLength(0);
        });
    });

    describe('updateCanteen', () => {
        it('should update canteen when user is admin', async () => {
            mockGetStudent.mockResolvedValue(mockAdminStudent);
            mockRedisClient.hGetAll.mockResolvedValue(mockStoredCanteen);

            const result = await updateCanteen('1', { name: 'Updated Canteen' }, '1');

            expect(result.name).toBe('Updated Canteen');
            expect(mockRedisClient.hSet).toHaveBeenCalled();
        });

        it('should reject update when user is not admin', async () => {
            mockGetStudent.mockResolvedValue(mockRegularStudent);

            await expect(updateCanteen('1', { name: 'Updated' }, '2'))
                .rejects.toThrow('Only admin students can create canteens');
        });

        it('should return null when canteen not found', async () => {
            mockGetStudent.mockResolvedValue(mockAdminStudent);
            mockRedisClient.hGetAll.mockResolvedValue({});

            const result = await updateCanteen('999', { name: 'Updated' }, '1');

            expect(result).toBeNull();
        });
    });

    describe('deleteCanteen', () => {
        it('should delete canteen when user is admin', async () => {
            mockGetStudent.mockResolvedValue(mockAdminStudent);
            mockRedisClient.del.mockResolvedValue(1);

            const result = await deleteCanteen('1', '1');

            expect(result).toBe(true);
            expect(mockRedisClient.del).toHaveBeenCalledWith('canteen:1');
        });

        it('should reject delete when user is not admin', async () => {
            mockGetStudent.mockResolvedValue(mockRegularStudent);

            await expect(deleteCanteen('1', '2'))
                .rejects.toThrow('Only admin students can create canteens');
        });

        it('should return false when canteen not found', async () => {
            mockGetStudent.mockResolvedValue(mockAdminStudent);
            mockRedisClient.del.mockResolvedValue(0);

            const result = await deleteCanteen('999', '1');

            expect(result).toBe(false);
        });
    });

    describe('getCanteenStatus', () => {
        beforeEach(() => {
            mockRedisClient.hGetAll.mockResolvedValue(mockStoredCanteen);
            mockRedisClient.get.mockResolvedValue(null); // No reservations by default
        });

        it('should return 30-min slots within working hours', async () => {
            const result = await getCanteenStatus('1', '2025-12-01', '08:00', '2025-12-01', '10:00', '30');

            expect(result.slots).toHaveLength(4); // 08:00, 08:30, 09:00, 09:30
            expect(result.slots[0]).toMatchObject({
                date: '2025-12-01',
                meal: 'breakfast',
                startTime: '08:00',
                remainingCapacity: 30
            });
            expect(result.slots[1].startTime).toBe('08:30');
            expect(result.slots[2].startTime).toBe('09:00');
            expect(result.slots[3].startTime).toBe('09:30');
        });

        it('should return 60-min slots only at even hours', async () => {
            const result = await getCanteenStatus('1', '2025-12-01', '08:00', '2025-12-01', '10:00', '60');

            expect(result.slots).toHaveLength(2); // 08:00, 09:00 (60-min only at :00)
            expect(result.slots[0].startTime).toBe('08:00');
            expect(result.slots[1].startTime).toBe('09:00');
        });

        it('should calculate remaining capacity for 30-min slots', async () => {
            // Simulate 5 reservations at 08:00
            mockRedisClient.get.mockImplementation((key) => {
                if (key === 'slot:1:2025-12-01:08:00') return Promise.resolve('5');
                return Promise.resolve(null);
            });

            const result = await getCanteenStatus('1', '2025-12-01', '08:00', '2025-12-01', '09:00', '30');

            expect(result.slots[0].remainingCapacity).toBe(25); // 30 - 5
            expect(result.slots[1].remainingCapacity).toBe(30); // No reservations at 08:30
        });

        it('should calculate remaining capacity for 60-min slots using max of both underlying slots', async () => {
            // Simulate: 08:00 has 5, 08:30 has 10 reservations
            mockRedisClient.get.mockImplementation((key) => {
                if (key === 'slot:1:2025-12-01:08:00') return Promise.resolve('5');
                if (key === 'slot:1:2025-12-01:08:30') return Promise.resolve('10');
                return Promise.resolve(null);
            });

            const result = await getCanteenStatus('1', '2025-12-01', '08:00', '2025-12-01', '09:00', '60');

            // 60-min slot at 08:00 should use max(5, 10) = 10
            expect(result.slots[0].remainingCapacity).toBe(20); // 30 - 10
        });

        it('should filter slots to only those within working hours', async () => {
            // Request time range that spans outside working hours
            const result = await getCanteenStatus('1', '2025-12-01', '07:00', '2025-12-01', '11:00', '30');

            // Should only include breakfast slots (08:00 - 10:00), not 07:00 or 10:00+
            expect(result.slots.every(s => s.meal === 'breakfast')).toBe(true);
            expect(result.slots[0].startTime).toBe('08:00');
        });

        it('should return null when canteen not found', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({});

            const result = await getCanteenStatus('999', '2025-12-01', '08:00', '2025-12-01', '10:00', '30');

            expect(result).toBeNull();
        });

        it('should handle multi-day range', async () => {
            const result = await getCanteenStatus('1', '2025-12-01', '08:00', '2025-12-02', '10:00', '30');

            // Should have slots for both days
            const day1Slots = result.slots.filter(s => s.date === '2025-12-01');
            const day2Slots = result.slots.filter(s => s.date === '2025-12-02');

            expect(day1Slots.length).toBeGreaterThan(0);
            expect(day2Slots.length).toBeGreaterThan(0);
        });

        it('should not return negative remaining capacity', async () => {
            // Simulate slot over capacity (edge case)
            mockRedisClient.get.mockResolvedValue('35'); // Over the 30 capacity

            const result = await getCanteenStatus('1', '2025-12-01', '08:00', '2025-12-01', '09:00', '30');

            expect(result.slots[0].remainingCapacity).toBe(0); // Should be 0, not -5
        });
    });

    describe('getAllCanteensStatus', () => {
        it('should return status for all canteens', async () => {
            mockRedisClient.keys.mockResolvedValue(['canteen:1', 'canteen:2', 'canteen:id:counter']);
            mockRedisClient.hGetAll
                .mockResolvedValueOnce(mockStoredCanteen)
                .mockResolvedValueOnce({
                    ...mockStoredCanteen,
                    id: '2',
                    name: 'Second Canteen'
                })
                // For getCanteenStatus calls
                .mockResolvedValue(mockStoredCanteen);
            mockRedisClient.get.mockResolvedValue(null);

            const result = await getAllCanteensStatus('2025-12-01', '08:00', '2025-12-01', '10:00', '30');

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('Main Canteen');
            expect(result[0].slots).toBeDefined();
            expect(result[1].name).toBe('Second Canteen');
            expect(result[1].slots).toBeDefined();
        });

        it('should return empty array when no canteens exist', async () => {
            mockRedisClient.keys.mockResolvedValue(['canteen:id:counter']);

            const result = await getAllCanteensStatus('2025-12-01', '08:00', '2025-12-01', '10:00', '30');

            expect(result).toHaveLength(0);
        });
    });
});
