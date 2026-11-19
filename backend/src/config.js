import 'dotenv/config';

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  isProd: process.env.NODE_ENV === 'production',
  corsOrigin: clientUrl === '*' ? true : clientUrl.split(',').map((s) => s.trim().replace(/\/$/, '')),
};
