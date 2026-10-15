// Phase 17 & 17.5: Repair & RMA tickets
import {
  RepairTicket,
  RepairStatus,
  RepairPath,
  RepairTimelineEntry,
  SerialUnit,
} from '../../stecsecure-types';
import { nextDocNumber } from '../../numbering';
import { Action, done, updateById } from '../core';

export interface CreateRepairTicketArgs {
  customerId: string;
  assignedTechnicianId: string;
  serialUnitId?: string;
  customUnitDescription?: string;
  sourceJobId?: string | null;
  faultDescription: string;
  initialNote?: string;
}

export const createRepairTicket: Action<CreateRepairTicketArgs, RepairTicket> = (s, env, data) => {
  const userId = env.actor?.id || 'usr-tech-1';
  const newTicket: RepairTicket = {
    id: env.newId('RMA'),
    ticketNumber: nextDocNumber(`RMA-${env.fy}-`, s.repairTickets.map((t) => t.ticketNumber)),
    serialUnitId: data.serialUnitId || undefined,
    customUnitDescription: data.customUnitDescription || undefined,
    customerId: data.customerId,
    assignedTechnicianId: data.assignedTechnicianId,
    sourceJobId: data.sourceJobId ?? null,
    faultDescription: data.faultDescription,
    status: 'FAULT_REPORTED',
    repairPath: null,
    createdByUserId: userId,
    createdAt: env.nowIso,
    timeline: [
      {
        status: 'FAULT_REPORTED',
        timestamp: env.nowIso,
        userId,
        note: data.initialNote || `Ticket logged: ${data.faultDescription}`,
      },
    ],
  };

  return done(
    {
      ...s,
      serialUnits: data.serialUnitId
        ? s.serialUnits.map((su) =>
            su.id === data.serialUnitId || su.serialNumber === data.serialUnitId
              ? { ...su, status: 'IN_REPAIR' as const }
              : su
          )
        : s.serialUnits,
      repairTickets: [newTicket, ...s.repairTickets],
    },
    newTicket
  );
};

export interface RepairTransitionDetails {
  note?: string;
  repairPath?: RepairPath;
  vendorId?: string;
  vendorSentDate?: string;
  vendorExpectedReturnDate?: string;
  vendorActualReturnDate?: string;
  vendorRepairNotes?: string;
  inHouseRepairedByUserId?: string;
  inHouseRepairNotes?: string;
  reinstalledLocation?: string;
}

export const transitionRepairTicket: Action<
  { ticketId: string; nextStatus: RepairStatus; details?: RepairTransitionDetails },
  void
> = (s, env, { ticketId, nextStatus, details }) => {
  const existingTicket = s.repairTickets.find((t) => t.id === ticketId);
  if (!existingTicket) return done(s, undefined);
  const userId = env.actor?.id || 'usr-mgr';

  const newTimelineEntry: RepairTimelineEntry = {
    status: nextStatus,
    timestamp: env.nowIso,
    userId,
    note: details?.note || `Stage changed to ${nextStatus.replace(/_/g, ' ')}`,
  };
  // A detail passed explicitly (even empty) replaces the stored value
  const pick = <K extends keyof RepairTransitionDetails & keyof RepairTicket>(key: K) =>
    details && details[key] !== undefined ? details[key] : existingTicket[key];

  const updatedTicket: RepairTicket = {
    ...existingTicket,
    status: nextStatus,
    timeline: [...existingTicket.timeline, newTimelineEntry],
    repairPath: details?.repairPath !== undefined ? details.repairPath : existingTicket.repairPath,
    vendorId: pick('vendorId') as string | undefined,
    vendorSentDate: pick('vendorSentDate') as string | undefined,
    vendorExpectedReturnDate: pick('vendorExpectedReturnDate') as string | undefined,
    vendorActualReturnDate: pick('vendorActualReturnDate') as string | undefined,
    vendorRepairNotes: pick('vendorRepairNotes') as string | undefined,
    inHouseRepairedByUserId: pick('inHouseRepairedByUserId') as string | undefined,
    inHouseRepairNotes: pick('inHouseRepairNotes') as string | undefined,
    reinstalledByUserId: nextStatus === 'REINSTALLED' ? userId : existingTicket.reinstalledByUserId,
    reinstalledAt: nextStatus === 'REINSTALLED' ? env.nowIso : existingTicket.reinstalledAt,
    reinstalledLocation: pick('reinstalledLocation') as string | undefined,
  };

  const isTicketUnit = (su: SerialUnit) =>
    su.id === existingTicket.serialUnitId || su.serialNumber === existingTicket.serialUnitId;
  let updatedSerials = s.serialUnits;
  if (existingTicket.serialUnitId) {
    if (nextStatus === 'REINSTALLED') {
      updatedSerials = s.serialUnits.map((su) =>
        isTicketUnit(su)
          ? {
              ...su,
              status: 'INSTALLED' as const,
              soldToCustomerId: existingTicket.customerId || su.soldToCustomerId,
              installedLocation: details?.reinstalledLocation || existingTicket.reinstalledLocation || su.installedLocation,
            }
          : su
      );
    } else if (nextStatus === 'WRITE_OFF') {
      updatedSerials = s.serialUnits.map((su) => (isTicketUnit(su) ? { ...su, status: 'RETURNED' as const } : su));
    } else if (
      nextStatus === 'PICKED_UP' ||
      nextStatus === 'CHECKED_IN_AT_OFFICE' ||
      nextStatus === 'IN_HOUSE_REPAIR' ||
      nextStatus === 'SENT_TO_VENDOR'
    ) {
      updatedSerials = s.serialUnits.map((su) => (isTicketUnit(su) ? { ...su, status: 'IN_REPAIR' as const } : su));
    }
  }

  return done(
    {
      ...s,
      serialUnits: updatedSerials,
      repairTickets: updateById(s.repairTickets, ticketId, () => updatedTicket),
    },
    undefined
  );
};
