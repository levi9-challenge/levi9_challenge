import { jest } from '@jest/globals';

// Mock Redis client
const mockMultiExec = jest.fn();
const mockMulti = jest.fn(() => ({
    get: jest.fn().mockReturnThis(),
    sIsMember: jest.fn().mockReturnThis(),
    hSet: jest.fn().mockReturnThis(),
    incr: jest.fn().mockReturnThis(),
    decr: jest.fn().mockReturnThis(),
    sAdd: jest.fn().mockReturnThis(),
    sRem: jest.fn().mockReturnThis(),
    exec: mockMultiExec
}));

const mockRedisClient = {
    multi: mockMulti,
    incr: jest.fn(),
    hGetAll: jest.fn()
};

// Mock canteen service
const mockGetCanteen = jest.fn();

// Mock the modules before importing
jest.unstable_mockModule('../config/redis.js', () => ({
    default: mockRedisClient
}));

jest.unstable_mockModule('./canteenService.js', () => ({
    getCanteen: mockGetCanteen
}));

// Import after mocking
const { createReservation, deleteReservation } = await import('./reservactionService.js');

describe('reservactionService', () => {
    const mockCanteen = {
        id: 1,
        name: 'Main Canteen',
        location: 'Building A',
        capacity: 30,
        workingHours: [
            { meal: 'breakfast', from: '08:00', to: '10:00' },
            { meal: 'lunch', from: '11:00', to: '13:00' }
        ]
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCanteen.mockResolvedValue(mockCanteen);
        mockRedisClient.incr.mockResolvedValue(1);
        mockMultiExec.mockResolvedValue([0, 0, false, false]); // Default: no bookings, no conflicts
    });

    describe('createReservation', () => {
        const futureDate = '2025-12-15';

        it('should create a valid 30-min reservation', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '08:30',
                duration: '30'
            };

            // Mock: slot count = 0, student not in slot
            mockMultiExec.mockResolvedValue([0, false]);

            const result = await createReservation(reservationData);

            expect(result).toMatchObject({
                id: 1,
                studentId: 42,
                canteenId: 1,
                date: futureDate,
                time: '08:30',
                duration: 30,
                status: 'Active'
            });
            expect(mockGetCanteen).toHaveBeenCalledWith('1');
        });

        it('should create a valid 60-min reservation and affect both slots', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '08:00',
                duration: '60'
            };

            // Mock: both slot counts = 0, student not in either slot
            mockMultiExec.mockResolvedValue([0, 0, false, false]);

            const result = await createReservation(reservationData);

            expect(result).toMatchObject({
                id: 1,
                studentId: 42,
                duration: 60,
                status: 'Active'
            });
        });

        it('should reject reservation with past date', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: '2020-01-01',
                time: '08:00',
                duration: '30'
            };

            await expect(createReservation(reservationData))
                .rejects.toThrow('Reservation date and time cannot be in the past');
        });

        it('should reject reservation outside working hours', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '07:00', // Before breakfast starts at 08:00
                duration: '30'
            };

            await expect(createReservation(reservationData))
                .rejects.toThrow('Invalid reservation time or duration');
        });

        it('should reject 60-min reservation not starting at even hour', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '08:30', // Not at :00
                duration: '60'
            };

            await expect(createReservation(reservationData))
                .rejects.toThrow('Invalid reservation time or duration');
        });

        it('should reject 60-min reservation where second slot is outside working hours', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '09:30', // 09:30 is valid, but 60-min must start at :00
                duration: '60'
            };

            await expect(createReservation(reservationData))
                .rejects.toThrow('Invalid reservation time or duration');
        });

        it('should reject reservation when slot is fully booked', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '08:00',
                duration: '30'
            };

            // Mock: slot is at capacity (30)
            mockMultiExec.mockResolvedValue([30, false]);

            await expect(createReservation(reservationData))
                .rejects.toThrow('fully booked');
        });

        it('should reject reservation when student already has booking at same time', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '1',
                date: futureDate,
                time: '08:00',
                duration: '30'
            };

            // Mock: slot has capacity, but student is already in the slot
            mockMultiExec.mockResolvedValue([5, true]);

            await expect(createReservation(reservationData))
                .rejects.toThrow('Student already has a reservation for this time slot');
        });

        it('should reject 30-min reservation when student has 60-min at overlapping time', async () => {
            const reservationData = {
                studentId: '42',
                canteenId: '2', // Different canteen
                date: futureDate,
                time: '08:30', // Overlaps with 08:00-09:00 booking
                duration: '30'
            };

            // Mock: slot has capacity, but student is in the 08:30 slot (from previous 60-min booking)
            mockMultiExec.mockResolvedValue([0, true]);

            await expect(createReservation(reservationData))
                .rejects.toThrow('Student already has a reservation for this time slot');
        });

        it('should reject when canteen not found', async () => {
            mockGetCanteen.mockResolvedValue(null);

            const reservationData = {
                studentId: '42',
                canteenId: '999',
                date: futureDate,
                time: '08:00',
                duration: '30'
            };

            await expect(createReservation(reservationData))
                .rejects.toThrow('Canteen not found');
        });
    });

    describe('deleteReservation', () => {
        it('should cancel reservation and restore capacity', async () => {
            const mockReservation = {
                id: '1',
                studentId: '42',
                canteenId: '1',
                date: '2025-12-15',
                time: '08:00',
                duration: '30',
                status: 'Active'
            };

            mockRedisClient.hGetAll
                .mockResolvedValueOnce(mockReservation) // First call: get reservation
                .mockResolvedValueOnce({ ...mockReservation, status: 'Cancelled' }); // Second call: get updated

            mockMultiExec.mockResolvedValue([1, 1, 1]); // hSet, decr, sRem

            const result = await deleteReservation('1', '42');

            expect(result).toMatchObject({
                id: 1,
                status: 'Cancelled',
                studentId: 42
            });
        });

        it('should cancel 60-min reservation and restore both slot capacities', async () => {
            const mockReservation = {
                id: '1',
                studentId: '42',
                canteenId: '1',
                date: '2025-12-15',
                time: '08:00',
                duration: '60',
                status: 'Active'
            };

            mockRedisClient.hGetAll
                .mockResolvedValueOnce(mockReservation)
                .mockResolvedValueOnce({ ...mockReservation, status: 'Cancelled' });

            mockMultiExec.mockResolvedValue([1, 1, 1, 1, 1]); // hSet, 2x decr, 2x sRem

            const result = await deleteReservation('1', '42');

            expect(result).toMatchObject({
                id: 1,
                status: 'Cancelled',
                duration: 60
            });
        });

        it('should return null when reservation not found', async () => {
            mockRedisClient.hGetAll.mockResolvedValue({});

            const result = await deleteReservation('999', '42');

            expect(result).toBeNull();
        });

        it('should return null when studentId does not match', async () => {
            const mockReservation = {
                id: '1',
                studentId: '42',
                canteenId: '1',
                date: '2025-12-15',
                time: '08:00',
                duration: '30',
                status: 'Active'
            };

            mockRedisClient.hGetAll.mockResolvedValue(mockReservation);

            const result = await deleteReservation('1', '99'); // Wrong student

            expect(result).toBeNull();
        });

        it('should return null when reservation already cancelled', async () => {
            const mockReservation = {
                id: '1',
                studentId: '42',
                canteenId: '1',
                date: '2025-12-15',
                time: '08:00',
                duration: '30',
                status: 'Cancelled'
            };

            mockRedisClient.hGetAll.mockResolvedValue(mockReservation);

            const result = await deleteReservation('1', '42');

            expect(result).toBeNull();
        });
    });
});
