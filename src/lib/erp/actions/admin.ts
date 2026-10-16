// Phase 18: CEO-managed access control
import { AppSection, ConfigurableRole, LeaveRecord, LeaveType, PayProfile } from '../../stecsecure-types';
import { leaveDays } from '../../leave';
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
export type SetPayProfileArgs = Pick<
  PayProfile,
  'monthlySalary' | 'serviceIncentive' | 'installationIncentive' | 'paidLeavePerMonth' | 'casualLeavePerMonth'
> & {
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
    paidLeavePerMonth: amount(args.paidLeavePerMonth ?? 0, 'Paid leave per month'),
    casualLeavePerMonth: amount(args.casualLeavePerMonth ?? 0, 'Casual leave per month'),
    updatedAt: env.nowIso,
  };
  const exists = s.payProfiles.some((p) => p.id === profile.id);
  return done(
    { ...s, payProfiles: exists ? s.payProfiles.map((p) => (p.id === profile.id ? profile : p)) : [profile, ...s.payProfiles] },
    profile
  );
};

// Leave: the office records leave taken (dates inclusive; Sundays are not counted)
export type AddLeaveArgs = { userId: string; type: LeaveType; from: string; to: string; halfDay?: boolean; reason?: string };
export const addLeave: Action<AddLeaveArgs, LeaveRecord> = (s, env, args) => {
  const user = s.users.find((u) => u.id === args.userId);
  if (!user) throw new Error('Staff member not found.');
  if (!['PAID', 'CASUAL', 'UNPAID'].includes(args.type)) throw new Error('Choose the type of leave.');
  const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(args.from) || !isDate(args.to)) throw new Error('Choose the leave dates.');
  if (args.to < args.from) throw new Error('The last day of leave is before the first day.');
  const halfDay = Boolean(args.halfDay) && args.from === args.to;
  const record: LeaveRecord = {
    id: env.newId('LV'),
    userId: args.userId,
    type: args.type,
    from: args.from,
    to: args.to,
    ...(halfDay ? { halfDay: true } : {}),
    reason: args.reason?.trim() || undefined,
    createdAt: env.nowIso,
    createdByUserId: env.actor?.id,
  };
  if (leaveDays(record) === 0) throw new Error('Those dates are only Sundays — there is no leave to record.');
  const clash = s.leaveRecords.find((l) => l.userId === args.userId && l.from <= record.to && record.from <= l.to);
  if (clash) throw new Error(`${user.name} already has leave recorded from ${clash.from} to ${clash.to}.`);
  return done({ ...s, leaveRecords: [record, ...s.leaveRecords] }, record);
};

export const deleteLeave: Action<{ leaveId: string }, void> = (s, _env, { leaveId }) => {
  if (!s.leaveRecords.some((l) => l.id === leaveId)) throw new Error('Leave entry not found.');
  return done({ ...s, leaveRecords: s.leaveRecords.filter((l) => l.id !== leaveId) }, undefined);
};
