import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { HttpError, wrap } from '../lib/http.js';

export const signToken = (user) => jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: '7d' });

export async function userFromToken(token) {
  if (!token) return null;
  const payload = jwt.verify(token, config.jwtSecret);
  return User.findById(payload.sub);
}

export const requireAuth = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let user = null;
  try {
    user = await userFromToken(token);
  } catch {
    /* fall through */
  }
  if (!user) throw new HttpError(401, 'Please sign in again');
  req.user = user;
  next();
});
