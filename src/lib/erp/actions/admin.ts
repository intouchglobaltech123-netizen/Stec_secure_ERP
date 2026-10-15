// Phase 18: CEO-managed access control
import { AppSection, ConfigurableRole } from '../../stecsecure-types';
import { Action, done } from '../core';

// Phase 22: mark the caller's notifications read (all of them, or the given ids)
export const markNotificationsRead: Action<{ ids?: string[] }, void> = (s, env, { ids }) => {
  const me = env.actor?.id;
  if (!me) return done(s, undefined);
  const wanted = ids ? new Set(ids) : null;
  let changed = false;
  const notifications = s.notifications.map((n) => {
    if (!n.recipientUserIds.includes(me) || n.readBy.includes(me) || (wanted && !wanted.has(n.id))) return n;
    changed = true;
    return { ...n, readBy: [...n.readBy, me] };
  });
  return done(changed ? { ...s, notifications } : s, undefined);
};

export const updateAccessControl: Action<{ role: ConfigurableRole; sections: AppSection[] }, void> = (
  s,
  env,
  { role, sections }
) => {
  if (env.actor?.role !== 'CEO') throw new Error('Only the CEO can change access control.');
  return done({ ...s, accessControl: { ...s.accessControl, [role]: sections } }, undefined);
};
