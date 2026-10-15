// Phone + 4-digit PIN login with server-side sessions.
// PINs are bcrypt-hashed; a session is a random token in an httpOnly cookie, stored only as a hash.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express, { NextFunction, Request, Response } from 'express';
import { Database } from './db';
import { Store, hashPin, normalizePhone } from './store';
import { config } from './config';
import { User } from '../../src/lib/stecsecure-types';

const COOKIE = 'erp_session';
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

// Per-address limit on login attempts, on top of the per-account lockout
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();
function tooManyAttemptsFrom(ip: string): boolean {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || entry.resetAt < now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}

export const isValidPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin);

export function createAuth(db: Database, store: Store) {
  const findUser = (id: string) => store.state.users.find((u) => u.id === id);

  async function startSession(res: Response, userId: string) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + config.sessionDays * 24 * 3600_000);
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
      sha256(token),
      userId,
      expires.toISOString(),
    ]);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      expires,
      path: '/',
    });
  }

  async function currentUser(req: Request): Promise<User | null> {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const { rows } = await db.query<{ user_id: string }>(
      `SELECT s.user_id FROM sessions s JOIN credentials c ON c.user_id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND c.active`,
      [sha256(token)]
    );
    if (!rows.length) return null;
    return findUser(rows[0].user_id) ?? null;
  }

  // Express middleware: rejects the request unless a valid session is present
  async function requireUser(req: Request, res: Response, next: NextFunction) {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Please log in again.' });
      return;
    }
    res.locals.user = user;
    next();
  }

  const router = express.Router();

  router.post('/login', async (req, res) => {
    const phone = normalizePhone(String(req.body?.phone ?? ''));
    const pin = String(req.body?.pin ?? '');
    const generic = 'Wrong phone number or PIN.';

    if (tooManyAttemptsFrom(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes and try again.' });
      return;
    }
    if (phone.length !== 10 || !isValidPin(pin)) {
      res.status(400).json({ error: generic });
      return;
    }

    const { rows } = await db.query<{
      user_id: string;
      pin_hash: string;
      active: boolean;
      failed_attempts: number;
      locked_until: string | null;
    }>('SELECT user_id, pin_hash, active, failed_attempts, locked_until FROM credentials WHERE phone = $1', [phone]);
    const cred = rows[0];
    if (!cred) {
      res.status(401).json({ error: generic });
      return;
    }
    if (!cred.active) {
      res.status(403).json({ error: 'This account is disabled. Please contact the CEO.' });
      return;
    }
    if (cred.locked_until && new Date(cred.locked_until) > new Date()) {
      const minutes = Math.ceil((new Date(cred.locked_until).getTime() - Date.now()) / 60_000);
      res.status(423).json({ error: `Too many wrong PINs. This account is locked for ${minutes} more minute(s).` });
      return;
    }

    if (!(await bcrypt.compare(pin, cred.pin_hash))) {
      const failed = cred.failed_attempts + 1;
      const lock = failed >= config.maxFailedLogins;
      await db.query(
        `UPDATE credentials SET failed_attempts = $2, locked_until = $3 WHERE user_id = $1`,
        [
          cred.user_id,
          lock ? 0 : failed,
          lock ? new Date(Date.now() + config.lockMinutes * 60_000).toISOString() : null,
        ]
      );
      res.status(401).json({
        error: lock
          ? `Too many wrong PINs. This account is locked for ${config.lockMinutes} minutes.`
          : generic,
      });
      return;
    }

    await db.query('UPDATE credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1', [
      cred.user_id,
    ]);
    const user = findUser(cred.user_id);
    if (!user) {
      res.status(403).json({ error: 'This account no longer exists.' });
      return;
    }
    await startSession(res, user.id);
    res.json({ user });
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', async (req, res) => {
    const user = await currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not logged in.' });
      return;
    }
    res.json({ user });
  });

  router.post('/change-pin', requireUser, async (req, res) => {
    const user = res.locals.user as User;
    const { currentPin, newPin } = req.body ?? {};
    if (!isValidPin(newPin)) {
      res.status(400).json({ error: 'The new PIN must be exactly 4 digits.' });
      return;
    }
    const { rows } = await db.query<{ pin_hash: string }>('SELECT pin_hash FROM credentials WHERE user_id = $1', [
      user.id,
    ]);
    if (!rows[0] || !(await bcrypt.compare(String(currentPin ?? ''), rows[0].pin_hash))) {
      res.status(400).json({ error: 'Your current PIN is not correct.' });
      return;
    }
    await db.query('UPDATE credentials SET pin_hash = $2, updated_at = now() WHERE user_id = $1', [
      user.id,
      await hashPin(newPin),
    ]);
    // Sign out other devices; keep this one
    const token = readCookie(req, COOKIE) ?? '';
    await db.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, sha256(token)]);
    res.json({ ok: true });
  });

  return { router, requireUser };
}
