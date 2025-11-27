# Canteen Reservation System

A REST API server for managing university canteen reservations. Students can reserve 30-minute or 60-minute meal slots at various canteens, with capacity tracking and conflict prevention.

## Features

- **Student Management**: Create and retrieve student accounts (admin/regular)
- **Canteen Management**: CRUD operations for canteens with working hours configuration
- **Reservation System**: Book meal slots with automatic capacity tracking
- **Slot Availability**: Query available time slots across date ranges
- **Conflict Prevention**: Prevents double-booking same time slot globally

## Technologies

| Technology | Version |
|------------|---------|
| Node.js    | 24.6.0  |
| npm        | 11.5.2  |
| Express    | 5.1.0   |
| Redis      | 5.10.0 (client) |
| Redis      | 6.0.16 (server) |
| Jest       | 30.2.0  |

## Prerequisites

- **Node.js** v24.x or higher
- **npm** v11.x or higher  
- **Redis Server** running on `localhost:6379`

## Setup Build Environment

1. **Install Node.js**
   
   Download and install from [nodejs.org](https://nodejs.org/) or use a version manager like nvm.

2. **Install Redis**
   
   - **Windows**: Use WSL2 or Docker: `docker run -p 6379:6379 redis`
   - **macOS**: `brew install redis && brew services start redis`
   - **Linux**: `sudo apt install redis-server && sudo systemctl start redis`

3. **Clone the repository**
   ```bash
   git clone https://github.com/aleksiye/levi9_challenge.git
   cd levi9_challenge
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

## Building the Application

This is a Node.js application using ES modules - **no build step is required**. The JavaScript source files are executed directly by Node.js.

If you need to verify the code is valid:
```bash
node --check index.js
```

## Starting the Application

1. **Ensure Redis is running**
   ```bash
   redis-cli ping
   # Should respond: PONG
   ```

2. **Start the server**
   ```bash
   npm start
   ```
   
   Or directly:
   ```bash
   node index.js
   ```

3. **Verify it's running**
   
   The server will display:
   ```
   Connected to Redis
   Flushed all Redis data on startup.
   Server running on http://localhost:3000
   ```

## Running Unit Tests

```bash
npm test
```

This runs Jest with ES module support. Expected output:
```
Test Suites: 3 passed, 3 total
Tests:       59 passed, 59 total
```

## API Endpoints

`*` = requires `studentId` header

### Students
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/students` | Create a new student |
| GET | `/students/:id` | Get student by ID |

### Canteens
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST * | `/canteens` | Create canteen (admin only) |
| GET | `/canteens` | Get all canteens |
| GET | `/canteens/status` | Get all canteens slot availability |
| GET | `/canteens/:id` | Get canteen by ID |
| GET | `/canteens/:id/status` | Get canteen slot availability |
| PUT * | `/canteens/:id` | Update canteen (admin only) |
| DELETE * | `/canteens/:id` | Delete canteen (admin only) |

### Reservations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/reservations` | Create reservation |
| GET * | `/reservations` | Get student reservations |
| DELETE * | `/reservations/:id` | Cancel reservation |

## Example Usage

```bash
# Create a student
curl -X POST http://localhost:3000/students \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "isAdmin": true}'

# Create a canteen (requires admin studentId)
curl -X POST http://localhost:3000/canteens \
  -H "Content-Type: application/json" \
  -H "studentId: 1" \
  -d '{"name": "Main Canteen", "location": "Building A", "capacity": 30, "workingHours": [{"meal": "breakfast", "from": "08:00", "to": "10:00"}]}'

# Check slot availability
curl "http://localhost:3000/canteens/1/status?startDate=2025-12-01&startTime=08:00&endDate=2025-12-01&endTime=10:00&duration=30"

# Make a reservation
curl -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" \
  -d '{"studentId": "1", "canteenId": "1", "date": "2025-12-01", "time": "08:00", "duration": "30"}'
```
