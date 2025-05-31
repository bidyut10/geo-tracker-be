# TrackRabbit - Website Analytics Platform

TrackRabbit is a powerful, scalable website analytics platform that provides detailed insights into user behavior and website performance. It's designed to handle high traffic loads while maintaining minimal impact on website performance.

## Features

- Real-time user tracking
- Detailed session analytics
- Page view and event tracking
- User behavior analysis
- Geographic data
- Device and browser statistics
- Bounce rate and time on page
- SPA (Single Page Application) support
- Bot traffic filtering
- Rate limiting and security features

## Technical Stack

- Node.js with Express
- MongoDB for data storage
- Redis (Upstash) with BullMQ for job queues
- JWT authentication
- Winston for logging

## Prerequisites

- Node.js 18+
- MongoDB
- Upstash Redis account

## Installation

1. Clone the repository:
```bash
git clone https://github.com/bidyut10/geo-tracker-be.git
cd geo-tracker-be
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/trackrabbit
REDIS_URL=your_upstash_redis_url
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

## Running the Application

1. Start the main server:
```bash
npm start
```

2. Start the worker process (in a separate terminal):
```bash
npm run worker
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with JWT

### Tracking
- `POST /api/track` - Receive tracking data
- `GET /api/track/t.js` - Get tracking script

### Analytics
- `GET /api/data/:projectId` - Get project analytics
- `GET /api/data/:projectId/realtime` - Get real-time visitors

## Tracking Script Integration

Add the following script tag to your website:

```html
<script src="https://your-domain.com/api/track/t.js?pid=YOUR_PROJECT_ID"></script>
```

## Security Features

- JWT-based authentication
- Rate limiting
- Bot traffic filtering
- Input validation
- CORS protection
- Secure headers (Helmet)

## Performance Optimizations

- Event batching
- Background job processing
- Efficient database indexing
- Compression middleware
- Redis caching
- Optimized tracking script

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details
