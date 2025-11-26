import express from 'express';
import redisClient from './config/redis.js' ;
import studentRoutes from './routes/students.js';
import canteenRoutes from './routes/canteens.js';
import reservationRoutes from './routes/reservations.js';

const app = express();
app.use(express.json());

await redisClient.flushAll();
console.log('Flushed all Redis data on startup.');

app.use('/students', studentRoutes);
app.use('/canteens', canteenRoutes);
app.use('/reservations', reservationRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('\nAvailable routes (* = requires studentId header):');
  console.log('\n  STUDENTS:');
  console.log('    POST   /students                  - Create a new student');
  console.log('    GET    /students/:id              - Get student by ID');
  console.log('\n  CANTEENS:');
  console.log('    POST   /canteens               *  - Create canteen (admin only)');
  console.log('    GET    /canteens                  - Get all canteens');
  console.log('    GET    /canteens/status           - Get all canteens slot availability');
  console.log('    GET    /canteens/:id              - Get canteen by ID');
  console.log('    GET    /canteens/:id/status       - Get canteen slot availability');
  console.log('    PUT    /canteens/:id           *  - Update canteen (admin only)');
  console.log('    DELETE /canteens/:id           *  - Delete canteen (admin only)');
  console.log('\n  RESERVATIONS:');
  console.log('    POST   /reservations              - Create reservation');
  console.log('    GET    /reservations           *  - Get student reservations (query: startDate, endDate)');
  console.log('    DELETE /reservations/:id       *  - Cancel reservation');
});
