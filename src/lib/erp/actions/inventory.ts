// Products, vendors and serial-tracked stock
import { Product, Vendor, SerialUnit, JobProductUsage, WorkLog } from '../../stecsecure-types';
import { nextDocNumber } from '../../numbering';
import { Action, done, updateById } from '../core';

export const addProduct: Action<Omit<Product, 'id'>, Product> = (s, _env, prod) => {
  const newProduct: Product = { ...prod, id: nextDocNumber('PROD-', s.products.map((p) => p.id)) };
  return done({ ...s, products: [newProduct, ...s.products] }, newProduct);
};

export const updateProduct: Action<{ id: string; updates: Partial<Product> }, void> = (s, _env, { id, updates }) =>
  done({ ...s, products: updateById(s.products, id, (p) => ({ ...p, ...updates })) }, undefined);

export const addVendor: Action<Omit<Vendor, 'id'>, Vendor> = (s, _env, vendor) => {
  const newVendor: Vendor = { ...vendor, id: nextDocNumber('VEND-', s.vendors.map((v) => v.id)) };
  return done({ ...s, vendors: [newVendor, ...s.vendors] }, newVendor);
};

export const updateVendor: Action<{ id: string; updates: Partial<Vendor> }, void> = (s, _env, { id, updates }) =>
  done({ ...s, vendors: updateById(s.vendors, id, (v) => ({ ...v, ...updates })) }, undefined);

export const addSerialUnit: Action<Omit<SerialUnit, 'id'>, SerialUnit> = (s, env, unit) => {
  const newUnit: SerialUnit = { ...unit, id: env.newId('SER') };
  return done({ ...s, serialUnits: [newUnit, ...s.serialUnits] }, newUnit);
};

export const updateSerialUnit: Action<{ id: string; updates: Partial<SerialUnit> }, void> = (
  s,
  _env,
  { id, updates }
) => done({ ...s, serialUnits: updateById(s.serialUnits, id, (u) => ({ ...u, ...updates })) }, undefined);

export interface StockInSerialsArgs {
  productId: string;
  serialNumbers: string[];
  vendorId?: string;
  purchaseDate?: string;
  purchaseCost?: number;
}

export const stockInSerials: Action<StockInSerialsArgs, SerialUnit[]> = (s, env, data) => {
  // Skip serials already in the system and repeats within this batch (double scans)
  const known = new Set(s.serialUnits.map((u) => u.serialNumber.trim().toUpperCase()));
  const uniqueSerials = data.serialNumbers
    .map((sn) => sn.trim())
    .filter((sn) => {
      const key = sn.toUpperCase();
      if (!sn || known.has(key)) return false;
      known.add(key);
      return true;
    });

  const createdSerials: SerialUnit[] = uniqueSerials.map((serialNumber) => ({
    id: env.newId('SER'),
    productId: data.productId,
    serialNumber,
    status: 'IN_STOCK' as const,
    purchasedFromVendorId: data.vendorId,
    purchaseDate: data.purchaseDate || env.today,
    purchaseCost: data.purchaseCost,
  }));

  return done({ ...s, serialUnits: [...createdSerials, ...s.serialUnits] }, createdSerials);
};

export const allocateSerialToJob: Action<{ serialId: string; jobId: string }, void> = (
  s,
  _env,
  { serialId, jobId }
) => {
  const serial = s.serialUnits.find((su) => su.id === serialId || su.serialNumber === serialId);
  if (!serial || serial.status !== 'IN_STOCK') return done(s, undefined);

  return done(
    {
      ...s,
      serialUnits: updateById(s.serialUnits, serial.id, (su) => ({
        ...su,
        status: 'ALLOCATED' as const,
        installedAtJobId: jobId,
      })),
      // Also ensure the job references this serial number if not already set
      jobs: s.jobs.map((j) => (j.id === jobId && !j.serialNo ? { ...j, serialNo: serial.serialNumber } : j)),
    },
    undefined
  );
};

export const installJobSerials: Action<{ jobId: string; customerId: string; location: string }, void> = (
  s,
  _env,
  { jobId, customerId, location }
) => {
  const job = s.jobs.find((j) => j.id === jobId);
  return done(
    {
      ...s,
      serialUnits: s.serialUnits.map((su) =>
        // match by installedAtJobId or serialNumber
        su.installedAtJobId === jobId || (job?.serialNo && su.serialNumber === job.serialNo)
          ? {
              ...su,
              status: 'INSTALLED' as const,
              soldToCustomerId: customerId,
              installedLocation: location || su.installedLocation || 'Customer site',
            }
          : su
      ),
    },
    undefined
  );
};

export const markSerialReturned: Action<{ serialId: string; reason?: string }, void> = (
  s,
  _env,
  { serialId, reason }
) =>
  done(
    {
      ...s,
      serialUnits: s.serialUnits.map((su) =>
        su.id === serialId || su.serialNumber === serialId
          ? {
              ...su,
              status: 'RETURNED' as const,
              installedLocation: reason ? `Returned: ${reason}` : 'Returned: Hardware RMA',
            }
          : su
      ),
    },
    undefined
  );

// Phase 22: undo a product wrongly added to a job (before completion); its units go back to stock
export const removeJobProductUsage: Action<{ usageId: string }, void> = (s, env, { usageId }) => {
  const usage = s.jobProductUsages.find((u) => u.id === usageId);
  if (!usage) throw new Error('That product entry no longer exists.');
  const job = s.jobs.find((j) => j.id === usage.jobId);
  if (job && !['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(job.status)) {
    throw new Error(`Job ${job.jobNumber} is already completed — products can no longer be removed.`);
  }
  const ids = new Set(usage.serialUnitIds || []);
  const released = s.serialUnits.filter(
    (su) => (ids.has(su.id) || ids.has(su.serialNumber)) && su.status === 'ALLOCATED' && su.installedAtJobId === usage.jobId
  );
  const releasedIds = new Set(released.map((su) => su.id));
  const prod = s.products.find((p) => p.id === usage.productId);
  const note = {
    timestamp: env.nowIso,
    note: `[PRODUCT REMOVED] ${prod?.name || 'Equipment'} x${usage.quantity}${
      released.length ? ` (S/N back to stock: ${released.map((su) => su.serialNumber).join(', ')})` : ''
    }`,
  };
  const log = s.workLogs.find((w) => w.jobId === usage.jobId);
  return done(
    {
      ...s,
      jobProductUsages: s.jobProductUsages.filter((u) => u.id !== usageId),
      serialUnits: s.serialUnits.map((su) =>
        releasedIds.has(su.id) ? { ...su, status: 'IN_STOCK' as const, installedAtJobId: undefined } : su
      ),
      workLogs: log
        ? s.workLogs.map((w) => (w.id === log.id ? { ...w, notesLog: [note, ...(w.notesLog || [])] } : w))
        : s.workLogs,
    },
    undefined
  );
};

// Phase 8: Flexible Product Usage (Quantity-based, addable anytime)
export interface AddJobProductUsageArgs {
  jobId: string;
  productId: string;
  quantity: number;
  serialUnitIds?: string[];
}

export const addJobProductUsage: Action<AddJobProductUsageArgs, JobProductUsage> = (s, env, data) => {
  const serialUnitIds = data.serialUnitIds || [];
  const newUsage: JobProductUsage = {
    id: env.newId('JPU'),
    jobId: data.jobId,
    productId: data.productId,
    quantity: Math.max(1, data.quantity),
    serialUnitIds,
    addedByUserId: env.actor?.id || 'usr-tech-1',
    addedAt: env.nowIso,
  };

  // Transition selected in-stock serial units to ALLOCATED
  const isSelected = (su: SerialUnit) => serialUnitIds.includes(su.id) || serialUnitIds.includes(su.serialNumber);
  const updatedSerials = serialUnitIds.length
    ? s.serialUnits.map((su) =>
        su.status === 'IN_STOCK' && isSelected(su)
          ? { ...su, status: 'ALLOCATED' as const, installedAtJobId: data.jobId }
          : su
      )
    : s.serialUnits;

  // Record in WorkLog for traceability
  const prod = s.products.find((p) => p.id === data.productId);
  const allocatedSnList = updatedSerials.filter(isSelected).map((su) => su.serialNumber);
  const serialSuffix = allocatedSnList.length > 0 ? ` (S/N: ${allocatedSnList.join(', ')})` : '';
  const noteEntry = {
    timestamp: env.nowIso,
    note: `[PRODUCT ADDED] ${prod?.name || 'Equipment'} x${data.quantity}${serialSuffix}`,
  };

  const existingLog = s.workLogs.find((w) => w.jobId === data.jobId);
  const updatedWorkLogs: WorkLog[] = existingLog
    ? s.workLogs.map((w) => (w.jobId === data.jobId ? { ...w, notesLog: [noteEntry, ...(w.notesLog || [])] } : w))
    : [
        {
          id: env.newId('WL'),
          jobId: data.jobId,
          userId: env.actor?.id || 'usr-tech-1',
          inTime: env.nowIso,
          notesLog: [noteEntry],
        },
        ...s.workLogs,
      ];

  return done(
    {
      ...s,
      jobProductUsages: [newUsage, ...s.jobProductUsages],
      serialUnits: updatedSerials,
      workLogs: updatedWorkLogs,
    },
    newUsage
  );
};
