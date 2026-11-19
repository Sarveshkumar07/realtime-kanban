// npm run seed --prefix backend   (needs MONGO_URI, WIPES that database)
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { seedDemo } from './seed.js';

const { memory } = await connectDb();
if (memory) console.log('No MONGO_URI set, nothing persistent to seed (the dev server seeds its in-memory DB automatically).');
else await seedDemo();
await mongoose.disconnect();
process.exit(0);
