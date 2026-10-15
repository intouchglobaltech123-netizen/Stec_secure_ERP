// Staff accounts (CEO only): add people, change their details or role, disable them, reset PINs
import express from 'express';
import { Database } from './db';
import { Store, hashPin, normalizePhone } from './store';
import { isValidPin } from './auth';
import { User, UserRole } from '../../src/lib/stecsecure-types';
import { withStaffCodes } from '../../src/lib/staff-code';

const ROLES: UserRole[] = ['CEO', 'MANAGER', 'TECHNICIAN'];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function createUsersRouter(db: Database, store: Store) {
  const router = express.Router();

  router.use((req, res, next) => {
    if ((res.locals.user as User).role !== 'CEO') {
      res.status(403).json({ error: 'Only the CEO can manage staff accounts.' });
      return;
    }
    next();
  });

  async function credentialsByUser() {
    const { rows } = await db.query<{ user_id: string; phone: string; active: boolean; locked_until: string | null }>(
      'SELECT user_id, phone, active, locked_until FROM credentials'
    );
    return new Map(rows.map((r) => [r.user_id, r]));
  }

  async function assertPhoneFree(phone: string, exceptUserId?: string) {
    const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM credentials WHERE phone = $1', [phone]);
    if (rows.length && rows[0].user_id !== exceptUserId) {
      throw new HttpError(409, 'Another staff member already uses this phone number.');
    }
  }

  // There must always be at least one active CEO, or nobody can manage the system
  async function assertKeepsActiveCeo(changingUserId: string, nextRole: UserRole, nextActive: boolean) {
    if (nextRole === 'CEO' && nextActive) return;
    const creds = await credentialsByUser();
    const otherActiveCeo = store.state.users.some(
      (u) => u.id !== changingUserId && u.role === 'CEO' && creds.get(u.id)?.active
    );
    if (!otherActiveCeo) throw new HttpError(400, 'There must always be at least one active CEO account.');
  }

  router.get('/', async (_req, res) => {
    const creds = await credentialsByUser();
    res.json({
      users: store.state.users.map((u) => {
        const c = creds.get(u.id);
        return {
          ...u,
          phone: c?.phone ?? u.phone,
          active: c?.active ?? false,
          locked: Boolean(c?.locked_until && new Date(c.locked_until) > new Date()),
        };
      }),
    });
  });

  router.post('/', async (req, res) => {
    const { name, role, phone: rawPhone, pin, email } = req.body ?? {};
    const phone = normalizePhone(String(rawPhone ?? ''));
    if (!String(name ?? '').trim()) throw new HttpError(400, 'Please enter a name.');
    if (!ROLES.includes(role)) throw new HttpError(400, 'Please choose a role.');
    if (phone.length !== 10) throw new HttpError(400, 'Please enter a 10-digit mobile number.');
    if (!isValidPin(pin)) throw new HttpError(400, 'The PIN must be exactly 4 digits.');
    await assertPhoneFree(phone);

    const user: User = {
      id: `usr-${Date.now().toString(36)}`,
      name: String(name).trim(),
      role,
      phone,
      email: email ? String(email).trim() : undefined,
    };
    const pinHash = await hashPin(pin);
    // The new person gets the next staff number for their role (TECH-004 …)
    let created = user;
    await store.commit(
      (s) => {
        const users = withStaffCodes([...s.users, user]);
        created = users[users.length - 1];
        return { ...s, users };
      },
      async (tx) => {
        await tx.query('INSERT INTO credentials (user_id, phone, pin_hash) VALUES ($1, $2, $3)', [
          user.id,
          phone,
          pinHash,
        ]);
      }
    );
    res.status(201).json({ user: created });
  });

  router.patch('/:id', async (req, res) => {
    const id = req.params.id;
    const existing = store.state.users.find((u) => u.id === id);
    if (!existing) throw new HttpError(404, 'Staff member not found.');
    const { name, role, phone: rawPhone, email, active } = req.body ?? {};

    const nextRole: UserRole = role ?? existing.role;
    if (!ROLES.includes(nextRole)) throw new HttpError(400, 'Please choose a role.');
    const creds = await credentialsByUser();
    const nextActive: boolean = active ?? creds.get(id)?.active ?? true;
    if (existing.role === 'CEO') await assertKeepsActiveCeo(id, nextRole, nextActive);

    const phone = rawPhone !== undefined ? normalizePhone(String(rawPhone)) : undefined;
    if (phone !== undefined) {
      if (phone.length !== 10) throw new HttpError(400, 'Please enter a 10-digit mobile number.');
      await assertPhoneFree(phone, id);
    }

    const updated: User = {
      ...existing,
      name: name !== undefined ? String(name).trim() || existing.name : existing.name,
      role: nextRole,
      phone: phone ?? existing.phone,
      email: email !== undefined ? String(email).trim() || undefined : existing.email,
    };
    // A change of role gives the next staff number for the new role
    let saved = updated;
    await store.commit(
      (s) => {
        const users = withStaffCodes(s.users.map((u) => (u.id === id ? updated : u)));
        saved = users.find((u) => u.id === id) ?? updated;
        return { ...s, users };
      },
      async (tx) => {
        await tx.query(
          'UPDATE credentials SET phone = COALESCE($2, phone), active = $3, updated_at = now() WHERE user_id = $1',
          [id, phone ?? null, nextActive]
        );
        // A disabled account is signed out everywhere at once
        if (!nextActive) await tx.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      }
    );
    res.json({ user: saved, active: nextActive });
  });

  router.post('/:id/reset-pin', async (req, res) => {
    const id = req.params.id;
    const user = store.state.users.find((u) => u.id === id);
    if (!user) throw new HttpError(404, 'Staff member not found.');
    const { pin } = req.body ?? {};
    if (!isValidPin(pin)) throw new HttpError(400, 'The PIN must be exactly 4 digits.');
    // Step 3: staff restored from a backup have no login yet — setting a PIN creates it
    const phone = normalizePhone(user.phone);
    if (phone.length !== 10) throw new HttpError(400, 'Add a 10-digit mobile number for this staff member first.');
    await assertPhoneFree(phone, id);
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO credentials (user_id, phone, pin_hash) VALUES ($1, $3, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now()`,
        [id, await hashPin(pin), phone]
      );
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    });
    res.json({ ok: true });
  });

  return router;
}

export { HttpError };
