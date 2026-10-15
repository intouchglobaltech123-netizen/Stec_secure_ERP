// Customers and enquiries
import { Customer, Enquiry, EnquiryStatus } from '../../stecsecure-types';
import { nextDocNumber } from '../../numbering';
import { Action, done, updateById } from '../core';

export const addCustomer: Action<Omit<Customer, 'id' | 'createdAt'>, Customer> = (s, env, cust) => {
  const newCustomer: Customer = {
    ...cust,
    id: nextDocNumber('CUST-', s.customers.map((c) => c.id)),
    createdAt: env.nowIso,
  };
  return done({ ...s, customers: [newCustomer, ...s.customers] }, newCustomer);
};

export const updateCustomer: Action<{ id: string; updates: Partial<Customer> }, void> = (s, _env, { id, updates }) =>
  done({ ...s, customers: updateById(s.customers, id, (c) => ({ ...c, ...updates })) }, undefined);

export type CreateEnquiryArgs = Omit<Enquiry, 'id' | 'enquiryNumber' | 'createdAt' | 'followUpNotes' | 'status'> & {
  status?: EnquiryStatus;
};

export const createEnquiry: Action<CreateEnquiryArgs, Enquiry> = (s, env, data) => {
  const enquiryNumber = nextDocNumber(`ENQ-${env.fy}-`, s.enquiries.map((e) => e.enquiryNumber));
  const newEnquiry: Enquiry = {
    ...data,
    id: enquiryNumber,
    enquiryNumber,
    status: data.status || 'FOLLOW_UP',
    createdAt: env.nowIso,
    createdByUserId: env.actor?.id || 'usr-ceo',
    followUpNotes: [],
  };
  return done({ ...s, enquiries: [newEnquiry, ...s.enquiries] }, newEnquiry);
};

export const deleteEnquiry: Action<{ enquiryId: string }, void> = (s, _env, { enquiryId }) =>
  done(
    {
      ...s,
      enquiries: s.enquiries.filter((e) => e.id !== enquiryId),
      // Unlink quotations & jobs tied to this enquiry without deleting billing records
      quotations: s.quotations.map((q) => (q.enquiryId === enquiryId ? { ...q, enquiryId: undefined } : q)),
      jobs: s.jobs.map((j) => (j.enquiryId === enquiryId ? { ...j, enquiryId: undefined } : j)),
    },
    undefined
  );

export const addEnquiryFollowUpNote: Action<{ enquiryId: string; noteText: string }, void> = (
  s,
  env,
  { enquiryId, noteText }
) => {
  const newNote = {
    id: env.newId('fup'),
    text: noteText.trim(),
    createdAt: env.nowIso,
    createdByUserId: env.actor?.id,
    createdByUserName: env.actor?.name || 'Staff',
  };
  return done(
    {
      ...s,
      enquiries: updateById(s.enquiries, enquiryId, (e) => ({ ...e, followUpNotes: [newNote, ...e.followUpNotes] })),
    },
    undefined
  );
};

export const approveEnquiry: Action<{ enquiryId: string }, void> = (s, _env, { enquiryId }) =>
  done(
    {
      ...s,
      enquiries: updateById(s.enquiries, enquiryId, (e) => ({ ...e, status: 'APPROVED' as const })),
      quotations: s.quotations.map((q) =>
        q.enquiryId === enquiryId && q.status !== 'CONVERTED' ? { ...q, status: 'ACCEPTED' as const } : q
      ),
    },
    undefined
  );

export const cancelEnquiry: Action<{ enquiryId: string; reason: string }, void> = (s, _env, { enquiryId, reason }) =>
  done(
    {
      ...s,
      enquiries: updateById(s.enquiries, enquiryId, (e) => ({
        ...e,
        status: 'CANCELLED' as const,
        cancelledReason: reason.trim(),
      })),
    },
    undefined
  );

export const convertEnquiryToJob: Action<{ enquiryId: string; jobId: string }, void> = (
  s,
  _env,
  { enquiryId, jobId }
) =>
  done(
    {
      ...s,
      enquiries: updateById(s.enquiries, enquiryId, (e) => ({
        ...e,
        status: 'APPROVED' as const,
        convertedJobId: jobId,
      })),
      jobs: updateById(s.jobs, jobId, (j) => ({ ...j, enquiryId })),
      quotations: s.quotations.map((q) =>
        q.enquiryId === enquiryId && q.status !== 'CONVERTED' ? { ...q, status: 'ACCEPTED' as const } : q
      ),
    },
    undefined
  );
