// Job lifecycle actions: create → start → notes / materials / holds → complete (invoice) → OTP close
import {
  Job,
  JobStatus,
  WorkLog,
  HoldEvent,
  MaterialUsage,
  Invoice,
  LineItem,
  OTPVerification,
} from '../../stecsecure-types';
import { CANARA_BANK_DETAILS, SEED_BANK_DETAILS } from '../../seed-data';
import { nextDocNumber } from '../../numbering';
import {
  Action,
  ErpState,
  ActionEnv,
  done,
  updateById,
  invoiceTotals,
  makeLineItem,
  getJobQuotation,
  findInvoiceForJob,
  applyAdvancesToInvoice,
  withNotification,
  managementIds,
  jobSection,
  finalizeInvoiceTax,
} from '../core';

export type CreateJobArgs = Omit<Job, 'id' | 'createdAt' | 'jobNumber'> & {
  jobNumber?: string;
  teamLeadUserId?: string;
  enquiryId?: string;
  createdByUserId?: string;
};

export const createJob: Action<CreateJobArgs, Job> = (s, env, jobData) => {
  const jobNumber = jobData.jobNumber || nextDocNumber(`JOB-${env.fy}-`, s.jobs.map((j) => j.jobNumber));
  const newJob: Job = {
    ...jobData,
    id: jobNumber,
    jobNumber,
    status: 'ASSIGNED',
    teamLeadUserId: jobData.teamLeadUserId || jobData.assignedTeam[0],
    enquiryId: jobData.enquiryId,
    createdByUserId: jobData.createdByUserId || env.actor?.id || 'usr-ceo',
    serviceAmount: jobData.serviceAmount ?? 0,
    taxable: jobData.taxable ?? true,
    timerElapsedSeconds: 0,
    createdAt: env.nowIso,
  };

  const created = done(
    {
      ...s,
      jobs: [newJob, ...s.jobs],
      enquiries: jobData.enquiryId
        ? s.enquiries.map((e) =>
            e.id === jobData.enquiryId
              ? {
                  ...e,
                  status: 'APPROVED' as const,
                  convertedJobId: newJob.id,
                  quotationId: jobData.quotationId || e.quotationId,
                }
              : e
          )
        : s.enquiries,
      quotations: s.quotations.map((q) =>
        (jobData.enquiryId && q.enquiryId === jobData.enquiryId) ||
        (jobData.quotationId && (q.id === jobData.quotationId || q.quotationNo === jobData.quotationId))
          ? { ...q, status: q.status === 'CONVERTED' ? q.status : ('ACCEPTED' as const) }
          : q
      ),
    },
    newJob
  ).state;
  const customer = s.customers.find((c) => c.id === newJob.customerNumber);
  return done(
    withNotification(created, env, [...newJob.assignedTeam, newJob.teamLeadUserId], {
      title: `New job ${newJob.jobNumber} assigned to you`,
      body: `${newJob.category} ${newJob.type === 'INSTALLATION' ? 'installation' : 'service'}${
        customer ? ` · ${customer.name}` : ''
      }${newJob.scheduledFor ? ` · visit ${newJob.scheduledFor.replace('T', ' ')}` : ''}`,
      section: jobSection(newJob),
      jobId: newJob.id,
    }),
    newJob
  );
};

export const deleteJob: Action<{ jobId: string }, void> = (s, _env, { jobId }) =>
  done(
    {
      ...s,
      // Permanently remove the job
      jobs: s.jobs.filter((j) => j.id !== jobId),
      // Leave linked invoices intact (unlinked)
      invoices: s.invoices.map((inv) => (inv.linkedJobId === jobId ? { ...inv, linkedJobId: undefined } : inv)),
      // Transient child records cleaned up
      holdEvents: s.holdEvents.filter((h) => h.jobId !== jobId),
      workLogs: s.workLogs.filter((wl) => wl.jobId !== jobId),
      materialUsages: s.materialUsages.filter((m) => m.jobId !== jobId),
      jobProductUsages: s.jobProductUsages.filter((u) => u.jobId !== jobId),
      otpVerifications: s.otpVerifications.filter((o) => o.jobId !== jobId),
      // Revert enquiry linked job status
      enquiries: s.enquiries.map((e) => (e.convertedJobId === jobId ? { ...e, convertedJobId: undefined } : e)),
      // Units allocated to this job go back to stock (installed units stay with the customer)
      serialUnits: s.serialUnits.map((su) =>
        su.installedAtJobId === jobId
          ? su.status === 'ALLOCATED'
            ? { ...su, status: 'IN_STOCK' as const, installedAtJobId: undefined, challanId: undefined }
            : { ...su, installedAtJobId: undefined }
          : su
      ),
      deliveryChallans: s.deliveryChallans.map((dc) => (dc.jobId === jobId ? { ...dc, jobId: undefined } : dc)),
      repairTickets: s.repairTickets.map((t) => (t.sourceJobId === jobId ? { ...t, sourceJobId: null } : t)),
    },
    undefined
  );

export const updateJobStatus: Action<{ id: string; status: JobStatus }, void> = (s, env, { id, status }) =>
  done(
    {
      ...s,
      jobs: updateById(s.jobs, id, (j) => ({
        ...j,
        status,
        completedAt: status === 'COMPLETED' || status === 'CLOSED' ? j.completedAt || env.nowIso : j.completedAt,
      })),
    },
    undefined
  );

export const updateJob: Action<{ id: string; updates: Partial<Job> }, void> = (s, _env, { id, updates }) =>
  done({ ...s, jobs: updateById(s.jobs, id, (j) => ({ ...j, ...updates })) }, undefined);

export const startJob: Action<{ jobId: string; beforePhotoUrl?: string }, void> = (
  s,
  env,
  { jobId, beforePhotoUrl }
) => {
  const newLog: WorkLog = {
    id: env.newId('WL'),
    jobId,
    userId: env.actor?.id || 'unknown',
    inTime: env.nowIso,
    notesLog: [
      {
        timestamp: env.nowIso,
        note: `Team Lead ${env.actor?.name || ''} initiated field session with verified Before Photo.`,
      },
    ],
  };

  return done(
    {
      ...s,
      jobs: updateById(s.jobs, jobId, (j) => ({
        ...j,
        status: 'IN_PROGRESS' as const,
        beforePhotoUrl: beforePhotoUrl || j.beforePhotoUrl,
        timerStartedAt: env.nowIso,
        timerElapsedSeconds: j.timerElapsedSeconds || 0,
      })),
      workLogs: [newLog, ...s.workLogs],
    },
    undefined
  );
};

// Appends to the job's open work log, or opens a new one
function withWorkLogNote(s: ErpState, env: ActionEnv, jobId: string, note: string): ErpState {
  const existingLogIndex = s.workLogs.findIndex((w) => w.jobId === jobId && !w.outTime);
  if (existingLogIndex >= 0) {
    const updatedLogs = [...s.workLogs];
    const current = updatedLogs[existingLogIndex];
    updatedLogs[existingLogIndex] = {
      ...current,
      notesLog: [{ timestamp: env.nowIso, note }, ...current.notesLog],
    };
    return { ...s, workLogs: updatedLogs };
  }
  const newLog: WorkLog = {
    id: env.newId('WL'),
    jobId,
    userId: env.actor?.id || 'unknown',
    inTime: env.nowIso,
    notesLog: [{ timestamp: env.nowIso, note }],
  };
  return { ...s, workLogs: [newLog, ...s.workLogs] };
}

export const addWorkLogNote: Action<{ jobId: string; note: string }, void> = (s, env, { jobId, note }) =>
  done(withWorkLogNote(s, env, jobId, note), undefined);

export const addMaterialUsage: Action<
  { jobId: string; materialName: string; deliveredQty: number; returnedQty: number },
  void
> = (s, env, { jobId, materialName, deliveredQty, returnedQty }) => {
  const newUsage: MaterialUsage = {
    id: env.newId('MAT'),
    jobId,
    materialName,
    deliveredQty,
    returnedQty,
  };
  return done({ ...s, materialUsages: [newUsage, ...s.materialUsages] }, undefined);
};

// Seconds the job timer has run, including the currently running session
function elapsedSeconds(job: Job, env: ActionEnv): number {
  let elapsed = job.timerElapsedSeconds || 0;
  if (job.timerStartedAt) {
    const delta = Math.floor((env.now.getTime() - new Date(job.timerStartedAt).getTime()) / 1000);
    if (delta > 0) elapsed += delta;
  }
  return elapsed;
}

export const raiseHold: Action<{ jobId: string; reason: string }, void> = (s, env, { jobId, reason }) => {
  const targetJob = s.jobs.find((j) => j.id === jobId);
  const currentElapsed = targetJob ? elapsedSeconds(targetJob, env) : 0;

  const newHold: HoldEvent = {
    id: env.newId('HOLD'),
    jobId,
    reason,
    raisedByUserId: env.actor?.id || 'unknown',
    raisedAt: env.nowIso,
    status: 'OPEN',
  };

  const withNote = withNotification(withWorkLogNote(s, env, jobId, `[HOLD RAISED] ${reason}`), env, managementIds(s), {
    title: `${targetJob?.jobNumber || 'A job'} is on hold`,
    body: `${env.actor?.name || 'Technician'}: ${reason}`,
    section: targetJob ? jobSection(targetJob) : undefined,
    jobId,
  });
  return done(
    {
      ...withNote,
      holdEvents: [newHold, ...withNote.holdEvents],
      jobs: updateById(withNote.jobs, jobId, (j) => ({
        ...j,
        status: 'ON_HOLD' as const,
        timerElapsedSeconds: currentElapsed,
        timerStartedAt: undefined, // timer paused!
      })),
    },
    undefined
  );
};

export const resolveHoldEvent: Action<{ holdId: string }, void> = (s, env, { holdId }) => {
  const hold = s.holdEvents.find((h) => h.id === holdId);
  if (!hold) return done(s, undefined);
  const heldJob = s.jobs.find((j) => j.id === hold.jobId);

  return done(
    {
      ...withNotification(s, env, heldJob ? [...heldJob.assignedTeam, heldJob.teamLeadUserId, hold.raisedByUserId] : [], {
        title: `${heldJob?.jobNumber || 'Job'} resumed — hold cleared`,
        body: hold.reason,
        section: heldJob ? jobSection(heldJob) : undefined,
        jobId: hold.jobId,
      }),
      holdEvents: updateById(s.holdEvents, holdId, (h) => ({
        ...h,
        status: 'RESOLVED' as const,
        resolvedByUserId: env.actor?.id,
        resolvedAt: env.nowIso,
      })),
      jobs: updateById(s.jobs, hold.jobId, (j) => ({
        ...j,
        status: 'IN_PROGRESS' as const,
        timerStartedAt: env.nowIso, // resume timer from preserved timerElapsedSeconds
      })),
    },
    undefined
  );
};

// Phase 22: management edits a job's details, team and schedule (not once it is closed or cancelled)
export type EditableJobFields = Partial<
  Pick<
    Job,
    | 'category'
    | 'problemReported'
    | 'customerStatus'
    | 'productModel'
    | 'serialNo'
    | 'assignedTeam'
    | 'teamLeadUserId'
    | 'scheduledFor'
    | 'siteContactName'
    | 'siteContactPhone'
  >
>;

export const editJob: Action<{ jobId: string; updates: EditableJobFields }, Job> = (s, env, { jobId, updates }) => {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error('Job not found.');
  if (job.status === 'CLOSED' || job.status === 'CANCELLED') {
    throw new Error(`Job ${job.jobNumber} is ${job.status.toLowerCase()} and can no longer be edited.`);
  }
  // Only these fields can change here; status, billing and timer fields have their own actions
  const allowed: (keyof EditableJobFields)[] = [
    'category',
    'problemReported',
    'customerStatus',
    'productModel',
    'serialNo',
    'assignedTeam',
    'teamLeadUserId',
    'scheduledFor',
    'siteContactName',
    'siteContactPhone',
  ];
  const clean: EditableJobFields = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) (clean as any)[key] = updates[key];
  }

  const team = clean.assignedTeam ?? job.assignedTeam;
  if (!team.length) throw new Error('A job needs at least one technician.');
  const lead = clean.teamLeadUserId ?? job.teamLeadUserId ?? team[0];
  if (!team.includes(lead)) throw new Error('The team lead must be one of the assigned technicians.');
  if (clean.problemReported !== undefined && !clean.problemReported.trim()) {
    throw new Error('The scope / problem description cannot be empty.');
  }

  const updated: Job = { ...job, ...clean, assignedTeam: team, teamLeadUserId: lead };
  const userName = (id: string) => s.users.find((u) => u.id === id)?.name || id;
  const teamChanged = team.join() !== job.assignedTeam.join() || lead !== job.teamLeadUserId;
  const note = teamChanged
    ? `[JOB UPDATED] Team: ${team.map(userName).join(', ')} (lead ${userName(lead)})`
    : '[JOB UPDATED] Job details updated';

  const withJob = { ...s, jobs: updateById(s.jobs, jobId, () => updated) };
  const added = team.filter((id) => !job.assignedTeam.includes(id));
  const notified = withNotification(withWorkLogNote(withJob, env, jobId, note), env, added, {
    title: `You were added to job ${job.jobNumber}`,
    body: updated.problemReported,
    section: jobSection(job),
    jobId,
  });
  return done(notified, updated);
};

// Phase 22: cancel instead of delete — the record stays, allocated stock goes back to the shelf
export const cancelJob: Action<{ jobId: string; reason: string }, void> = (s, env, { jobId, reason }) => {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error('Job not found.');
  if (!reason.trim()) throw new Error('Please give a reason for cancelling.');
  if (job.status === 'CANCELLED') return done(s, undefined);
  const invoice = findInvoiceForJob(s, job);
  if (invoice) throw new Error(`Job ${job.jobNumber} is already invoiced as ${invoice.invoiceNo} and cannot be cancelled.`);

  const elapsed = elapsedSeconds(job, env);
  const cancelled = done(
    {
      ...s,
      jobs: updateById(s.jobs, jobId, (j) => ({
        ...j,
        status: 'CANCELLED' as const,
        cancelledAt: env.nowIso,
        cancelledByUserId: env.actor?.id,
        cancelledReason: reason.trim(),
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })),
      // Close the job's open holds and work logs
      holdEvents: s.holdEvents.map((h) =>
        h.jobId === jobId && h.status === 'OPEN'
          ? { ...h, status: 'RESOLVED' as const, resolvedAt: env.nowIso, resolvedByUserId: env.actor?.id }
          : h
      ),
      workLogs: withWorkLogNote(s, env, jobId, `[JOB CANCELLED] ${reason.trim()}`).workLogs.map((w) =>
        w.jobId === jobId && !w.outTime ? { ...w, outTime: env.nowIso } : w
      ),
      // Units allocated to this job go back to stock
      serialUnits: s.serialUnits.map((su) =>
        su.installedAtJobId === jobId && su.status === 'ALLOCATED'
          ? { ...su, status: 'IN_STOCK' as const, installedAtJobId: undefined, challanId: undefined }
          : su
      ),
    },
    undefined
  ).state;
  return done(
    withNotification(cancelled, env, [...job.assignedTeam, job.teamLeadUserId], {
      title: `Job ${job.jobNumber} was cancelled`,
      body: reason.trim(),
      section: jobSection(job),
      jobId,
    }),
    undefined
  );
};

export interface CompleteJobArgs {
  jobId: string;
  afterPhotoUrl?: string;
  serviceAmount?: number;
  serviceGstChoice?: 'GST' | 'NO_GST';
  actionTaken?: string;
  installedLocation?: string;
}

export const completeJob: Action<CompleteJobArgs, Invoice | undefined> = (s, env, completionData) => {
  const { jobId } = completionData;
  const targetJob = s.jobs.find((j) => j.id === jobId);
  if (!targetJob) return done(s, undefined);
  if (targetJob.status === 'AWAITING_OTP' || targetJob.status === 'CLOSED' || targetJob.status === 'COMPLETED') {
    return done(s, s.invoices.find((i) => i.linkedJobId === jobId));
  }
  const alreadyInvoiced = findInvoiceForJob(s, targetJob);
  const finalDuration = elapsedSeconds(targetJob, env);

  // Phase 19 (F1): a job raised from a quotation bills the quotation as agreed, plus anything used
  // beyond it. Jobs without a quotation bill labour + materials + products used, as before.
  const jobQuotation = getJobQuotation(s, targetJob);

  const sAmount =
    completionData.serviceAmount ??
    (jobQuotation ? 0 : targetJob.serviceAmount > 0 ? targetJob.serviceAmount : 1500);
  const gstChoice = completionData.serviceGstChoice ?? targetJob.serviceGstChoice ?? 'GST';
  const isTaxable = gstChoice === 'GST';
  const gstRate = isTaxable ? 18 : 0; // service / labour line only

  // Line items for the invoice — the quotation as agreed comes first
  const lineItems: LineItem[] = jobQuotation ? jobQuotation.lineItems.map((li) => ({ ...li })) : [];
  const quotedLineCount = lineItems.length;
  // Quoted quantity not yet matched by usage, so items used up to the quote aren't billed twice
  const quotedQtyLeft = lineItems.map((li) => li.qty);
  const findQuoteLine = (name: string) => {
    const n = name.trim().toLowerCase();
    const names = lineItems.slice(0, quotedLineCount).map((li) => li.itemName.trim().toLowerCase());
    const exact = names.findIndex((q) => q === n);
    return exact >= 0 ? exact : names.findIndex((q) => q.includes(n) || n.includes(q));
  };
  // How much of `qty` the quotation does not cover, and the quotation line it fell under
  const consumeQuoted = (name: string, qty: number) => {
    const idx = jobQuotation ? findQuoteLine(name) : -1;
    if (idx < 0) return { extraQty: qty, quoteIdx: -1 };
    const covered = Math.min(qty, quotedQtyLeft[idx]);
    quotedQtyLeft[idx] -= covered;
    return { extraQty: qty - covered, quoteIdx: idx };
  };
  const extraPrefix = jobQuotation ? `Additional to quotation ${jobQuotation.quotationNo} — ` : '';

  if (sAmount > 0) {
    lineItems.push(
      makeLineItem(
        jobQuotation
          ? `Additional Labour beyond Quotation ${jobQuotation.quotationNo}`
          : `${targetJob.type === 'INSTALLATION' ? 'Installation & Commissioning' : 'Service & Labor Charges'} - ${targetJob.category}`,
        completionData.actionTaken || targetJob.problemReported || 'Standard field service resolution & testing',
        '998719',
        gstRate,
        1,
        sAmount
      )
    );
  }

  // Material usages if any
  s.materialUsages
    .filter((m) => m.jobId === jobId)
    .forEach((mat) => {
      const netQty = Math.max(0, mat.deliveredQty - mat.returnedQty);
      if (netQty <= 0) return;
      const { extraQty, quoteIdx } = consumeQuoted(mat.materialName, netQty);
      if (extraQty <= 0) return;
      const quoteLine = quoteIdx >= 0 ? lineItems[quoteIdx] : undefined;
      const prod = s.products.find((p) => p.name.toLowerCase().includes(mat.materialName.toLowerCase()));
      lineItems.push(
        makeLineItem(
          mat.materialName,
          `${extraPrefix}Material consumed during ${targetJob.jobNumber}`,
          quoteLine?.hsnSac || prod?.hsnSac || '85258090',
          quoteLine?.gstRate ?? prod?.gstRate ?? 18,
          extraQty,
          quoteLine?.rate ?? prod?.defaultRate ?? 350
        )
      );
    });

  // Phase 8: Products Used if any (hardware installed)
  const jobProducts = s.jobProductUsages.filter((u) => u.jobId === jobId);
  jobProducts.forEach((pu) => {
    const prod = s.products.find((p) => p.id === pu.productId);
    if (!prod) return;
    const serials = (pu.serialUnitIds || []).map(
      (sid) => s.serialUnits.find((su) => su.id === sid || su.serialNumber === sid)?.serialNumber || sid
    );
    const serialText = serials.length > 0 ? ` (S/N: ${serials.join(', ')})` : '';
    const { extraQty, quoteIdx } = consumeQuoted(prod.name, pu.quantity);

    if (quoteIdx >= 0 && extraQty < pu.quantity && serialText) {
      // Installed serials are recorded on the quotation line they fall under (warranty reference)
      lineItems[quoteIdx] = {
        ...lineItems[quoteIdx],
        description: `${lineItems[quoteIdx].description || ''}${serialText}`.trim(),
      };
    }
    if (extraQty <= 0) return;

    const quoteLine = quoteIdx >= 0 ? lineItems[quoteIdx] : undefined;
    lineItems.push(
      makeLineItem(
        prod.name,
        `${extraPrefix}Hardware installed during ${targetJob.jobNumber}${quoteIdx >= 0 ? '' : serialText}`,
        quoteLine?.hsnSac || prod.hsnSac || '85258090',
        quoteLine?.gstRate ?? prod.gstRate ?? 18,
        extraQty,
        quoteLine?.rate ?? prod.defaultRate
      )
    );
  });

  const totals = invoiceTotals(lineItems);
  const newInvoice: Invoice | undefined = alreadyInvoiced
    ? undefined
    : finalizeInvoiceTax(s, {
        id: env.newId('INV'),
        invoiceNo: nextDocNumber(`INV-${env.fy}-`, s.invoices.map((i) => i.invoiceNo)),
        customerNumber: targetJob.customerNumber || '',
        date: env.today,
        validityDays: 15,
        lineItems,
        termsAndConditions:
          '1. Payment due within 7 days of invoice.\n2. Standard 1-Year hardware warranty on installed devices.\n3. Physical damages, unauthorized tampering or power surges not covered under warranty.',
        ...totals,
        bankDetails: CANARA_BANK_DETAILS,
        linkedJobId: jobId,
        quotationId: jobQuotation?.id,
        amountPaid: 0,
        balanceDue: totals.grandTotal,
        paymentMode: 'PENDING',
        raisedByUserId: env.actor?.id,
        beforePhotoUrl: targetJob.beforePhotoUrl,
        afterPhotoUrl: completionData.afterPhotoUrl || targetJob.afterPhotoUrl,
      });

  const newOtp: OTPVerification = {
    id: env.newId('OTP'),
    jobId,
    otpCode: '1234',
    sentAt: env.nowIso,
    status: 'PENDING',
  };

  // Transition serial units to INSTALLED if applicable (including any allocated via JobProductUsage)
  const loc = completionData.installedLocation || 'Customer Site';
  const allUsageSerialIds = jobProducts.flatMap((u) => u.serialUnitIds || []);

  const completed: ErpState = {
      ...s,
      jobs: updateById(s.jobs, jobId, (j) => ({
        ...j,
        status: 'AWAITING_OTP' as const,
        completedAt: env.nowIso,
        actionTaken: completionData.actionTaken || j.actionTaken || 'Work completed and verified on site.',
        afterPhotoUrl: completionData.afterPhotoUrl || j.afterPhotoUrl,
        serviceAmount: sAmount,
        taxable: isTaxable,
        serviceGstChoice: gstChoice,
        totalDurationSeconds: finalDuration,
        timerStartedAt: undefined,
        timerElapsedSeconds: finalDuration,
      })),
      invoices: alreadyInvoiced
        ? updateById(s.invoices, alreadyInvoiced.id, (i) => ({ ...i, linkedJobId: jobId }))
        : [newInvoice!, ...s.invoices],
      otpVerifications: [newOtp, ...s.otpVerifications.filter((o) => o.jobId !== jobId)],
      // Close open work logs
      workLogs: s.workLogs.map((w) => (w.jobId === jobId && !w.outTime ? { ...w, outTime: env.nowIso } : w)),
      serialUnits: s.serialUnits.map((su) => {
        if (su.status === 'IN_REPAIR' || su.status === 'RETURNED') return su;
        if (
          su.installedAtJobId === jobId ||
          allUsageSerialIds.includes(su.id) ||
          allUsageSerialIds.includes(su.serialNumber) ||
          (targetJob.serialNo && su.serialNumber === targetJob.serialNo)
        ) {
          return {
            ...su,
            status: 'INSTALLED' as const,
            soldToCustomerId: targetJob.customerNumber,
            installedLocation: loc,
          };
        }
        return su;
      }),
  };
  if (alreadyInvoiced) return done(completed, { ...alreadyInvoiced, linkedJobId: jobId });
  if (jobQuotation) {
    completed.quotations = updateById(completed.quotations, jobQuotation.id, (q) => ({
      ...q,
      status: 'CONVERTED' as const,
    }));
  }
  // Phase 22: advances taken against this job or its quotation count towards the new invoice
  const next = applyAdvancesToInvoice(completed, newInvoice!.id);
  const finalInvoice = next.invoices.find((i) => i.id === newInvoice!.id)!;
  return done(
    withNotification(next, env, managementIds(s), {
      title: `${targetJob.jobNumber} completed by ${env.actor?.name || 'the team'}`,
      body: `Invoice ${finalInvoice.invoiceNo} · ₹${finalInvoice.grandTotal.toLocaleString('en-IN')}${
        finalInvoice.amountPaid ? ` (₹${finalInvoice.amountPaid.toLocaleString('en-IN')} advance applied)` : ''
      }`,
      section: jobSection(targetJob),
      jobId,
    }),
    finalInvoice
  );
};

export interface RaiseJobInvoiceArgs {
  jobId: string;
  lineItems: LineItem[];
  termsAndConditions?: string;
  paymentMode?: 'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING';
  amountPaid?: number;
  validityDays?: number;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
}

export const raiseJobInvoice: Action<RaiseJobInvoiceArgs, Invoice> = (s, env, invoiceData) => {
  const { jobId, lineItems } = invoiceData;
  const job = s.jobs.find((j) => j.id === jobId);
  const existing = job ? findInvoiceForJob(s, job) : undefined;
  if (existing) {
    throw new Error(`Job ${job!.jobNumber} is already invoiced as ${existing.invoiceNo}.`);
  }

  const totals = invoiceTotals(lineItems);
  const amountPaid = Math.min(totals.grandTotal, Math.max(0, invoiceData.amountPaid ?? 0));

  const newInvoice: Invoice = finalizeInvoiceTax(s, {
    id: env.newId('INV'),
    invoiceNo: nextDocNumber(`INV-${env.fy}-`, s.invoices.map((i) => i.invoiceNo)),
    customerNumber: job?.customerNumber || '',
    date: env.today,
    validityDays: invoiceData.validityDays || 15,
    lineItems,
    termsAndConditions:
      invoiceData.termsAndConditions ||
      '1. Payment due within 7 days of invoice.\n2. Standard 1-year warranty on CCTV and automation electronics.\n3. Physical damages or lightning surges not covered.',
    ...totals,
    bankDetails: SEED_BANK_DETAILS,
    linkedJobId: jobId,
    amountPaid,
    balanceDue: totals.grandTotal - amountPaid,
    paymentMode: invoiceData.paymentMode || 'PENDING',
    raisedByUserId: env.actor?.id,
    beforePhotoUrl: invoiceData.beforePhotoUrl || job?.beforePhotoUrl,
    afterPhotoUrl: invoiceData.afterPhotoUrl || job?.afterPhotoUrl,
  });

  const newOtp: OTPVerification = {
    id: env.newId('OTP'),
    jobId,
    otpCode: '1234',
    sentAt: env.nowIso,
    status: 'PENDING',
  };

  const next = applyAdvancesToInvoice(
    {
      ...s,
      invoices: [newInvoice, ...s.invoices],
      otpVerifications: [newOtp, ...s.otpVerifications.filter((o) => o.jobId !== jobId)],
      jobs: updateById(s.jobs, jobId, (j) => ({ ...j, status: 'AWAITING_OTP' as const })),
    },
    newInvoice.id
  );
  return done(next, next.invoices.find((i) => i.id === newInvoice.id)!);
};

export const verifyJobOtp: Action<{ jobId: string; enteredCode: string }, boolean> = (
  s,
  env,
  { jobId, enteredCode }
) => {
  const job = s.jobs.find((j) => j.id === jobId);
  const otp = s.otpVerifications.find((o) => o.jobId === jobId);
  if (!job || job.status !== 'AWAITING_OTP' || !otp) return done(s, false);
  if (enteredCode.trim() !== otp.otpCode) return done(s, false);

  return done(
    {
      ...s,
      otpVerifications: s.otpVerifications.map((o) =>
        o.jobId === jobId ? { ...o, status: 'VERIFIED' as const, verifiedAt: env.nowIso } : o
      ),
      jobs: updateById(s.jobs, jobId, (j) => ({
        ...j,
        status: 'CLOSED' as const,
        completedAt: j.completedAt || env.nowIso,
      })),
    },
    true
  );
};
