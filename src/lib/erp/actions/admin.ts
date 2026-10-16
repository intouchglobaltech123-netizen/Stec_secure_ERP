// Phase 18: CEO-managed access control
import { AppSection, ConfigurableRole, PayProfile } from '../../stecsecure-types';
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

// Payroll: the CEO sets a person's monthly salary and per-job incentives
export type SetPayProfileArgs = Pick<PayProfile, 'monthlySalary' | 'serviceIncentive' | 'installationIncentive'> & {
  userId: string;
};
export const setPayProfile: Action<SetPayProfileArgs, PayProfile> = (s, env, args) => {
  if (env.actor?.role !== 'CEO') throw new Error('Only the CEO can set salaries.');
  if (!s.users.some((u) => u.id === args.userId)) throw new Error('Staff member not found.');
  const amount = (v: unknown, label: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or more.`);
    return Math.round(n * 100) / 100;
  };
  const profile: PayProfile = {
    id: args.userId,
    monthlySalary: amount(args.monthlySalary, 'Monthly salary'),
    serviceIncentive: amount(args.serviceIncentive, 'Service job incentive'),
    installationIncentive: amount(args.installationIncentive, 'Installation job incentive'),
    updatedAt: env.nowIso,
  };
  const exists = s.payProfiles.some((p) => p.id === profile.id);
  return done(
    { ...s, payProfiles: exists ? s.payProfiles.map((p) => (p.id === profile.id ? profile : p)) : [profile, ...s.payProfiles] },
    profile
  );
};
