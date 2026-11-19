import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { HttpError, bad, wrap } from '../lib/http.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const r = Router();
const COLORS = ['#e4572e', '#2e86ab', '#6a994e', '#9b5de5', '#f2a541', '#d1495b', '#00798c', '#8d6a9f'];

r.post('/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) throw bad('Name, email and a password of at least 6 characters are required');
  if (await User.findOne({ email: email.toLowerCase().trim() })) throw new HttpError(409, 'That email is already registered');
  const user = await User.create({
    name: name.trim(),
    email,
    passwordHash: await bcrypt.hash(password, 10),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  });
  res.status(201).json({ token: signToken(user), user });
}));

r.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = email && (await User.findOne({ email: String(email).toLowerCase().trim() }));
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) throw new HttpError(401, 'Wrong email or password');
  res.json({ token: signToken(user), user });
}));

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default r;
