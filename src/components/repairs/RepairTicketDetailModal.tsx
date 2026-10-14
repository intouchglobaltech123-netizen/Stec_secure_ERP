import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { RepairTicket, RepairStatus } from '@/lib/stecsecure-types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Building2,
  Cpu,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Send,
  Calendar,
  User,
  MapPin,
  XCircle,
  ArrowRight,
  ShieldCheck,
  History,
  HardHat,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

interface RepairTicketDetailModalProps {
  ticket: RepairTicket | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToJob?: (jobId: string) => void;
}

export const RepairTicketDetailModal: React.FC<RepairTicketDetailModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onNavigateToJob,
}) => {
  const {
    currentUser,
    users,
    customers,
    vendors,
    serialUnits,
    products,
    jobs,
    transitionRepairTicket,
  } = useStecSecure();

  // Action form state
  const [activeActionForm, setActiveActionForm] = useState<string | null>(null);
  const [genericNote, setGenericNote] = useState('');

  // In-House form state
  const [assignedTechId, setAssignedTechId] = useState('usr-tech-1');
  const [inHouseNotes, setInHouseNotes] = useState('');

  // Vendor form state
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [vendorSentDate, setVendorSentDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [vendorExpectedReturnDate, setVendorExpectedReturnDate] = useState('');
  const [vendorRepairNotes, setVendorRepairNotes] = useState('');

  // Vendor return form state
  const [vendorActualReturnDate, setVendorActualReturnDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [vendorReturnNotes, setVendorReturnNotes] = useState('');

  // Reinstall form state
  const [reinstalledLocation, setReinstalledLocation] = useState('');
  const [reinstallNotes, setReinstallNotes] = useState('');

  // Write-off form state
  const [writeOffReason, setWriteOffReason] = useState('');

  // Reset local state when ticket changes
  React.useEffect(() => {
    if (ticket) {
      setActiveActionForm(null);
      setGenericNote('');
      setAssignedTechId(ticket.inHouseRepairedByUserId || 'usr-tech-1');
      setInHouseNotes(ticket.inHouseRepairNotes || '');
      setSelectedVendorId(ticket.vendorId || vendors[0]?.id || '');
      setVendorSentDate(ticket.vendorSentDate || new Date().toISOString().split('T')[0]);
      setVendorExpectedReturnDate(ticket.vendorExpectedReturnDate || '');
      setVendorRepairNotes(ticket.vendorRepairNotes || '');
      setVendorActualReturnDate(ticket.vendorActualReturnDate || new Date().toISOString().split('T')[0]);
      setVendorReturnNotes(ticket.vendorRepairNotes || '');
      setReinstalledLocation(ticket.reinstalledLocation || '');
      setReinstallNotes('');
      setWriteOffReason('');
    }
  }, [ticket, vendors]);

  if (!ticket) return null;

  const isManagement = currentUser?.role === 'CEO' || currentUser?.role === 'MANAGER';

  const customer = customers.find((c) => c.id === ticket.customerId);
  const serial = serialUnits.find((s) => s.id === ticket.serialUnitId);
  const product = serial ? products.find((p) => p.id === serial.productId) : null;
  const vendor = vendors.find((v) => v.id === ticket.vendorId);
  const createdUser = users.find((u) => u.id === ticket.createdByUserId);
  const assignedTech = users.find((u) => u.id === ticket.assignedTechnicianId);
  const isAssignedTechnician = currentUser?.id === ticket.assignedTechnicianId;
  const isUnauthorizedTechnician = currentUser?.role === 'TECHNICIAN' && !isAssignedTechnician;
  const sourceJob = ticket.sourceJobId ? jobs.find((j) => j.id === ticket.sourceJobId) : null;

  // Overdue calculation (Task 4)
  const isOverdue =
    ticket.status === 'SENT_TO_VENDOR' &&
    ticket.vendorExpectedReturnDate &&
    new Date().toISOString().split('T')[0] > ticket.vendorExpectedReturnDate;

  const overdueDays =
    isOverdue && ticket.vendorExpectedReturnDate
      ? Math.max(
          1,
          Math.floor(
            (new Date().getTime() - new Date(ticket.vendorExpectedReturnDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  // Status badge config
  const getStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case 'FAULT_REPORTED':
        return <Badge variant="warning">Fault Reported</Badge>;
      case 'PICKED_UP':
        return <Badge variant="orange">Picked Up in Transit</Badge>;
      case 'CHECKED_IN_AT_OFFICE':
        return <Badge variant="default">Checked In at Lab</Badge>;
      case 'IN_HOUSE_REPAIR':
        return <Badge variant="orange">In-House Bench Repair</Badge>;
      case 'SENT_TO_VENDOR':
        return <Badge variant="danger">Sent to Vendor RMA</Badge>;
      case 'READY_TO_REINSTALL':
        return <Badge variant="success">Fixed &bull; Ready to Reinstall</Badge>;
      case 'REINSTALLED':
        return <Badge variant="success">Reinstalled &amp; Closed</Badge>;
      case 'WRITE_OFF':
        return <Badge variant="secondary">Written Off / Scrap</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper date formatter
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return (
      d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ' ' +
      d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  };

  const formatDateOnly = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Transitions handlers
  const handleMarkPickedUp = () => {
    if (!isAssignedTechnician) {
      toast.error(`Only the assigned technician (${assignedTech?.name || 'assigned technician'}) can mark this unit as Picked Up`);
      return;
    }
    transitionRepairTicket(ticket.id, 'PICKED_UP', {
      note: genericNote.trim() || `Unit dismantled and collected from customer premises into transit by ${currentUser?.name || 'assigned technician'}.`,
    });
    toast.success('Ticket marked as Picked Up');
    setActiveActionForm(null);
    setGenericNote('');
  };

  const handleCheckInAtOffice = () => {
    if (!isManagement) {
      toast.error('Only Managers and CEO can check in units at the office');
      return;
    }
    transitionRepairTicket(ticket.id, 'CHECKED_IN_AT_OFFICE', {
      note: genericNote.trim() || 'Physical arrival confirmed at office service lab. Initial triage inspection completed.',
    });
    toast.success('Unit checked into office');
    setActiveActionForm(null);
    setGenericNote('');
  };

  const handleStartInHouseRepair = () => {
    if (!isManagement) {
      toast.error('Only Managers and CEO can assign in-house repairs');
      return;
    }
    const tech = users.find((u) => u.id === assignedTechId);
    transitionRepairTicket(ticket.id, 'IN_HOUSE_REPAIR', {
      repairPath: 'IN_HOUSE',
      inHouseRepairedByUserId: assignedTechId,
      inHouseRepairNotes: inHouseNotes.trim() || 'Assigned for internal bench repair & diagnostic testing.',
      note: `In-house repair initiated. Assigned to ${tech?.name || 'Technician'}. Notes: ${inHouseNotes.trim() || 'Diagnostic in progress'}`,
    });
    toast.success('In-house bench repair initiated');
    setActiveActionForm(null);
  };

  const handleSendToVendor = () => {
    if (!isManagement) {
      toast.error('Only Managers and CEO can dispatch units to external vendors');
      return;
    }
    if (!vendorExpectedReturnDate) {
      toast.error('Vendor Expected Return Date is REQUIRED (e.g. vendor promised 2 days)');
      return;
    }

    const selVendor = vendors.find((v) => v.id === selectedVendorId);
    transitionRepairTicket(ticket.id, 'SENT_TO_VENDOR', {
      repairPath: 'VENDOR',
      vendorId: selectedVendorId,
      vendorSentDate,
      vendorExpectedReturnDate,
      vendorRepairNotes: vendorRepairNotes.trim() || undefined,
      note: `Dispatched to vendor ${selVendor?.name || 'Vendor'}. Expected return date: ${vendorExpectedReturnDate}. ${vendorRepairNotes.trim()}`,
    });
    toast.success('Unit dispatched to vendor RMA');
    setActiveActionForm(null);
  };

  const handleMarkInHouseFixed = () => {
    if (!isManagement) {
      toast.error('Only Managers and CEO can mark repair as fixed and ready to reinstall');
      return;
    }
    transitionRepairTicket(ticket.id, 'READY_TO_REINSTALL', {
      inHouseRepairNotes: inHouseNotes.trim() || ticket.inHouseRepairNotes,
      note: `In-house repair completed & soak-test passed. ${inHouseNotes.trim()}`,
    });
    toast.success('Unit marked Fixed and Ready to Reinstall');
    setActiveActionForm(null);
  };

  const handleMarkVendorReceived = () => {
    if (!isManagement) {
      toast.error('Only Managers and CEO can confirm vendor return delivery');
      return;
    }
    transitionRepairTicket(ticket.id, 'READY_TO_REINSTALL', {
      vendorActualReturnDate,
      vendorRepairNotes: vendorReturnNotes.trim() || ticket.vendorRepairNotes,
      note: `Received repaired unit from vendor on ${vendorActualReturnDate}. Tested OK. Notes: ${vendorReturnNotes.trim()}`,
    });
    toast.success('Received from vendor & verified working! Ready to reinstall.');
    setActiveActionForm(null);
  };

  const handleMarkWriteOff = () => {
    if (!isManagement) {
      toast.error('Only Managers and CEO can write off hardware');
      return;
    }
    transitionRepairTicket(ticket.id, 'WRITE_OFF', {
      note: `Unit declared WRITE-OFF / Scrap: ${writeOffReason.trim() || 'Vendor deemed irreparable'}`,
    });
    toast.success('Unit marked as WRITE-OFF');
    setActiveActionForm(null);
  };

  const handleReinstallAtCustomer = () => {
    if (!isAssignedTechnician) {
      toast.error(`Only the assigned technician (${assignedTech?.name || 'assigned technician'}) can record reinstallation at customer site`);
      return;
    }
    if (!reinstalledLocation.trim()) {
      toast.error('Please specify the reinstallation location (e.g. Front Gate Portico)');
      return;
    }

    transitionRepairTicket(ticket.id, 'REINSTALLED', {
      reinstalledLocation: reinstalledLocation.trim(),
      note: `Reinstalled at customer site by ${currentUser?.name || 'assigned technician'}: ${reinstalledLocation.trim()}. Final testing verified. ${reinstallNotes.trim()}`,
    });
    toast.success('Unit reinstalled! Inventory Serial status restored to INSTALLED.');
    setActiveActionForm(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <span>{ticket.ticketNumber}</span>
          {getStatusBadge(ticket.status)}
          {ticket.repairPath && (
            <Badge variant="outline" className="text-[10px] font-mono uppercase">
              {ticket.repairPath === 'IN_HOUSE' ? 'In-House' : 'Vendor'}
            </Badge>
          )}
        </div>
      }
      subtitle={
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span>Logged on {formatDateTime(ticket.createdAt)} by {createdUser?.name || 'User'}</span>
          <span>&bull;</span>
          <span className="font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded flex items-center gap-1">
            <HardHat className="w-3 h-3 text-orange-600" />
            Assigned to: {assignedTech?.name || 'Unassigned'}
          </span>
        </div>
      }
      icon={<Wrench className="w-5 h-5 text-orange-600" />}
      maxWidth="3xl"
    >
      {isUnauthorizedTechnician ? (
        <div className="p-8 text-center space-y-3 font-sans">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Access Restricted</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            You are not the technician assigned to this repair ticket ({ticket.ticketNumber}).
            Only the assigned technician (<strong className="text-slate-800">{assignedTech?.name || 'Assigned Technician'}</strong>) or management can view and act on this ticket.
          </p>
          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 pt-1 font-sans">
        {/* Overdue Warning Alert Box (Task 4) */}
        {isOverdue && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-rose-50 via-rose-50/70 to-amber-50 border border-rose-200 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-rose-900 text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Vendor Repair Past Expected Return Window
              </div>
              <Badge variant="danger" className="text-[10px]">
                {overdueDays} DAYS OVERDUE
              </Badge>
            </div>
            <p className="text-xs text-rose-800 leading-relaxed">
              Unit was dispatched to <strong>{vendor?.name || 'Vendor'}</strong> on{' '}
              {formatDateOnly(ticket.vendorSentDate)} with promised turnaround by{' '}
              <strong>{formatDateOnly(ticket.vendorExpectedReturnDate)}</strong>. It is now{' '}
              <strong>{overdueDays} days overdue</strong>. Call vendor contact{' '}
              {vendor?.phone ? `(${vendor.phone})` : ''} to expedite courier tracking or record actual return below.
            </p>
          </div>
        )}

        {/* Top 3 Cards: Customer, Hardware, and Assigned Technician */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Customer Card */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-orange-600" />
              Customer &amp; Site
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">{customer?.name || 'Walk-In Customer'}</div>
              <div className="text-xs text-slate-600 mt-0.5">📞 {customer?.phone || 'No phone'}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-start gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{customer?.address || 'On-site'}</span>
              </div>
            </div>

            {sourceJob && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Source Job:</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToJob?.(sourceJob.id);
                  }}
                  className="font-mono font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  {sourceJob.jobNumber} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Hardware Unit Card */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-orange-600" />
              Hardware Unit Details
            </div>

            {serial ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-orange-700">
                    {serial.serialNumber}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {product?.category || 'Hardware'}
                  </Badge>
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-1">
                  {product?.name || 'Unknown Product Model'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Inventory Status: <span className="font-mono font-bold text-slate-700">{serial.status}</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-mono font-bold text-slate-800">
                  {ticket.customUnitDescription || 'Walk-in uncatalogued hardware'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Uncatalogued Unit (walk-in intake)
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-600">Fault Reported:</div>
              <div className="text-xs text-rose-700 italic bg-rose-50/60 p-2 rounded-lg border border-rose-100 mt-1">
                &ldquo;{ticket.faultDescription}&rdquo;
              </div>
            </div>
          </div>

          {/* Assigned Technician Card */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <HardHat className="w-3.5 h-3.5 text-orange-600" />
                Physical Custody
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span>{assignedTech?.name || 'Unassigned'}</span>
                  {isAssignedTechnician && (
                    <Badge variant="orange" className="text-[10px]">You</Badge>
                  )}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">📞 {assignedTech?.phone || 'No phone'}</div>
                <div className="text-xs text-slate-500 mt-0.5">✉️ {assignedTech?.email || 'No email'}</div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-600 bg-orange-50/60 p-2 rounded-lg border border-orange-100 leading-tight">
                <strong>Physical Handling:</strong> Responsible for unit site pickup, transit handover, and site reinstallation.
              </div>
            </div>
          </div>
        </div>

        {/* Current Stage Action Panel (Task 3 Lifecycle & Task 6 Permissions) */}
        <div className="rounded-2xl border-2 border-orange-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                  Stage Actions &amp; Lifecycle Controls
                </h3>
                <p className="text-[11px] text-slate-500">
                  Role-gated transitions for current stage: <strong className="text-slate-800">{ticket.status}</strong>
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Active Persona: <strong className="text-slate-900">{currentUser?.name}</strong> ({currentUser?.role})
            </div>
          </div>

          {/* STAGE 1: FAULT_REPORTED */}
          {ticket.status === 'FAULT_REPORTED' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Unit fault is recorded. Physical collection is assigned to{' '}
                <strong>{assignedTech?.name || 'Assigned Technician'}</strong>.
              </div>

              {isAssignedTechnician ? (
                activeActionForm === 'PICKUP' ? (
                  <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <label className="text-xs font-bold text-slate-800">
                      Handover / Transit Notes (Optional):
                    </label>
                    <Input
                      placeholder="e.g. Unit picked up from Front Portico, carefully packed in transit box."
                      value={genericNote}
                      onChange={(e) => setGenericNote(e.target.value)}
                      className="text-xs bg-white"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleMarkPickedUp}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                      >
                        Confirm Picked Up
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveActionForm(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setActiveActionForm('PICKUP')}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                  >
                    <Truck className="w-4 h-4" />
                    Mark Picked Up (Assigned Technician)
                  </Button>
                )
              ) : (
                <div className="text-xs text-slate-600 italic p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    Awaiting assigned technician (<strong>{assignedTech?.name || 'Assigned Technician'}</strong>) to physically collect the unit from the customer site and mark Picked Up.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STAGE 2: PICKED_UP */}
          {ticket.status === 'PICKED_UP' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                Unit is in transit. <strong>Manager or CEO</strong> must confirm physical receipt and sign into the office service lab.
              </div>

              {isManagement ? (
                activeActionForm === 'CHECKIN' ? (
                  <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <label className="text-xs font-bold text-slate-800">
                      Office Lab Inspection Notes:
                    </label>
                    <Input
                      placeholder="e.g. Received in workshop. Outer casing inspected, no physical cracks."
                      value={genericNote}
                      onChange={(e) => setGenericNote(e.target.value)}
                      className="text-xs bg-white"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleCheckInAtOffice}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                      >
                        Confirm Check-In at Office
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveActionForm(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setActiveActionForm('CHECKIN')}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                  >
                    <Building2 className="w-4 h-4" />
                    Check In at Office (Manager / CEO)
                  </Button>
                )
              ) : (
                <div className="text-xs text-slate-500 italic p-2 bg-slate-100 rounded-lg">
                  🔒 Waiting for Manager or CEO to check in unit at office service lab.
                </div>
              )}
            </div>
          )}

          {/* STAGE 3: CHECKED_IN_AT_OFFICE */}
          {ticket.status === 'CHECKED_IN_AT_OFFICE' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
                Unit is safely in the office workshop. <strong>Manager or CEO</strong> must decide the repair path:
                solve in-house on technician workbench, or dispatch to the authorized vendor RMA center.
              </div>

              {isManagement ? (
                <div className="space-y-4">
                  {/* Path Selection Buttons */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      variant={activeActionForm === 'IN_HOUSE' ? 'primary' : 'outline'}
                      onClick={() => setActiveActionForm('IN_HOUSE')}
                      className={`text-xs ${
                        activeActionForm === 'IN_HOUSE' ? 'bg-orange-600 text-white' : ''
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5 mr-1.5" />
                      Repair In-House
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant={activeActionForm === 'VENDOR' ? 'primary' : 'outline'}
                      onClick={() => setActiveActionForm('VENDOR')}
                      className={`text-xs ${
                        activeActionForm === 'VENDOR' ? 'bg-orange-600 text-white' : ''
                      }`}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      Send to Vendor RMA
                    </Button>
                  </div>

                  {/* In-House Form */}
                  {activeActionForm === 'IN_HOUSE' && (
                    <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/40 space-y-3">
                      <div className="text-xs font-bold text-slate-800">
                        Assign In-House Workbench Repair
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Assign Technician:
                        </label>
                        <select
                          value={assignedTechId}
                          onChange={(e) => setAssignedTechId(e.target.value)}
                          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                        >
                          {users
                            .filter((u) => u.role === 'TECHNICIAN' || u.role === 'MANAGER')
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Initial Diagnosis / Repair Scope:
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Firmware reflash, optical sensor cleaning, power rail test..."
                          value={inHouseNotes}
                          onChange={(e) => setInHouseNotes(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={handleStartInHouseRepair}
                          className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                        >
                          Start In-House Repair
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveActionForm(null)}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Vendor Form */}
                  {activeActionForm === 'VENDOR' && (
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
                      <div className="text-xs font-bold text-slate-800">
                        Dispatch Unit to Vendor Service Center
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">
                            Select Vendor *:
                          </label>
                          <select
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                          >
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.phone})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">
                            Dispatch / Sent Date:
                          </label>
                          <Input
                            type="date"
                            value={vendorSentDate}
                            onChange={(e) => setVendorSentDate(e.target.value)}
                            className="text-xs bg-white h-9"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-rose-600" />
                          Vendor Expected Return Date * (REQUIRED):
                        </label>
                        <Input
                          type="date"
                          required
                          value={vendorExpectedReturnDate}
                          onChange={(e) => setVendorExpectedReturnDate(e.target.value)}
                          className="text-xs bg-white h-9 border-rose-300 focus:border-rose-500"
                        />
                        <p className="text-[10px] text-slate-500">
                          e.g. If vendor commits to 2-3 day turnaround, specify date here. Exceeding this triggers automated Overdue warnings.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Vendor RMA / Courier Notes:
                        </label>
                        <Input
                          placeholder="e.g. Courier tracking #DTDC-99281, RMA ref HKV-4412"
                          value={vendorRepairNotes}
                          onChange={(e) => setVendorRepairNotes(e.target.value)}
                          className="text-xs bg-white h-9"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={handleSendToVendor}
                          className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                        >
                          Dispatch to Vendor
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveActionForm(null)}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic p-2 bg-slate-100 rounded-lg">
                  🔒 Waiting for Manager or CEO to decide between In-House and Vendor repair.
                </div>
              )}
            </div>
          )}

          {/* STAGE 4a: IN_HOUSE_REPAIR */}
          {ticket.status === 'IN_HOUSE_REPAIR' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-orange-600" />
                  Currently On Workbench
                </div>
                <div>
                  Assigned Technician:{' '}
                  <strong>
                    {users.find((u) => u.id === ticket.inHouseRepairedByUserId)?.name ||
                      'Unassigned'}
                  </strong>
                </div>
                {ticket.inHouseRepairNotes && (
                  <div className="text-[11px] text-orange-800 italic mt-0.5">
                    Scope: &ldquo;{ticket.inHouseRepairNotes}&rdquo;
                  </div>
                )}
              </div>

              {isManagement ? (
                activeActionForm === 'MARK_FIXED' ? (
                  <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                    <label className="text-xs font-bold text-slate-800">
                      Repair Resolution &amp; Testing Notes:
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Describe what was repaired (e.g. Replaced capacitor, updated firmware, 24-hr soak test passed)..."
                      value={inHouseNotes}
                      onChange={(e) => setInHouseNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 bg-white"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleMarkInHouseFixed}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      >
                        Confirm Fixed &amp; Ready
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveActionForm(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setActiveActionForm('MARK_FIXED')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark Fixed &amp; Ready to Reinstall (Manager / CEO)
                  </Button>
                )
              ) : (
                <div className="text-xs text-slate-600 italic p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Waiting for Manager or CEO to verify bench repair and mark Ready to Reinstall.</span>
                </div>
              )}
            </div>
          )}

          {/* STAGE 4b: SENT_TO_VENDOR */}
          {ticket.status === 'SENT_TO_VENDOR' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-slate-900">
                  <Truck className="w-3.5 h-3.5 text-orange-600" />
                  Vendor Dispatch Tracking
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div>
                    Vendor: <strong>{vendor?.name || 'Authorized Center'}</strong>
                  </div>
                  <div>
                    Dispatched: <strong>{formatDateOnly(ticket.vendorSentDate)}</strong>
                  </div>
                  <div>
                    Expected Return: <strong>{formatDateOnly(ticket.vendorExpectedReturnDate)}</strong>
                  </div>
                </div>
                {ticket.vendorRepairNotes && (
                  <div className="text-[11px] text-slate-500 pt-1">
                    Tracking Notes: {ticket.vendorRepairNotes}
                  </div>
                )}
              </div>

              {isManagement ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setActiveActionForm('RECEIVED_VENDOR')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Received from Vendor
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveActionForm('WRITE_OFF')}
                      className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      Mark as Write-Off (Unrepairable)
                    </Button>
                  </div>

                  {/* Received form */}
                  {activeActionForm === 'RECEIVED_VENDOR' && (
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                      <div className="text-xs font-bold text-slate-800">
                        Confirm Unit Returned from Vendor &amp; Verified Working
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">
                            Actual Return Date:
                          </label>
                          <Input
                            type="date"
                            value={vendorActualReturnDate}
                            onChange={(e) => setVendorActualReturnDate(e.target.value)}
                            className="text-xs bg-white h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700">
                            Vendor Service Notes / Replaced Parts:
                          </label>
                          <Input
                            placeholder="e.g. Sensor board replaced under warranty, QA test OK"
                            value={vendorReturnNotes}
                            onChange={(e) => setVendorReturnNotes(e.target.value)}
                            className="text-xs bg-white h-9"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={handleMarkVendorReceived}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          Confirm Received &amp; Ready to Reinstall
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveActionForm(null)}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Write-off form */}
                  {activeActionForm === 'WRITE_OFF' && (
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
                      <div className="text-xs font-bold text-rose-900">
                        Declare Unit as Write-Off / Beyond Repair
                      </div>
                      <p className="text-[11px] text-rose-700">
                        This will mark the ticket as WRITE_OFF and flag the inventory serial as RETURNED/SCRAP.
                      </p>
                      <Input
                        placeholder="Reason for write-off (e.g. Burnt motherboard, water corrosion beyond repair)..."
                        value={writeOffReason}
                        onChange={(e) => setWriteOffReason(e.target.value)}
                        className="text-xs bg-white h-9"
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={handleMarkWriteOff}
                          className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                        >
                          Confirm Write-Off
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveActionForm(null)}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic p-2 bg-slate-100 rounded-lg">
                  🔒 Waiting for Manager or CEO to record physical receipt from vendor or mark write-off.
                </div>
              )}
            </div>
          )}

          {/* STAGE 5: READY_TO_REINSTALL */}
          {ticket.status === 'READY_TO_REINSTALL' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Unit Repaired &amp; Ready for Reinstallation
                </div>
                <div>
                  Assigned technician (<strong>{assignedTech?.name || 'Assigned Technician'}</strong>) can now take the working unit back to the customer site, mount it in place, and confirm live operation.
                </div>
              </div>

              {isAssignedTechnician ? (
                activeActionForm === 'REINSTALL' ? (
                  <div className="space-y-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/30">
                    <div className="text-xs font-bold text-slate-800">
                      Record Site Reinstallation (Updates SerialUnit Status to INSTALLED)
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Exact Site Spot / Mount Location *:
                      </label>
                      <Input
                        placeholder="e.g. Front Gate Portico, Inside OneVU Cam Portico, 1st Floor Reception"
                        value={reinstalledLocation}
                        onChange={(e) => setReinstalledLocation(e.target.value)}
                        className="text-xs bg-white h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Reinstallation &amp; Verification Notes:
                      </label>
                      <Input
                        placeholder="e.g. Mounted back on bracket, live feed verified on customer app, signoff obtained."
                        value={reinstallNotes}
                        onChange={(e) => setReinstallNotes(e.target.value)}
                        className="text-xs bg-white h-9"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleReinstallAtCustomer}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      >
                        Confirm Reinstallation &amp; Close Ticket
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveActionForm(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setActiveActionForm('REINSTALL')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Reinstall at Customer (Assigned Technician)
                  </Button>
                )
              ) : (
                <div className="text-xs text-slate-600 italic p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    Awaiting assigned technician (<strong>{assignedTech?.name || 'Assigned Technician'}</strong>) to mount the unit at the customer site and confirm reinstallation.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STAGE 6: REINSTALLED */}
          {ticket.status === 'REINSTALLED' && (
            <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-sm text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Terminal State: Reinstalled &amp; Returned to Active Service
              </div>
              <div className="text-emerald-800">
                Reinstalled by:{' '}
                <strong>
                  {users.find((u) => u.id === ticket.reinstalledByUserId)?.name || 'Technician'}
                </strong>{' '}
                on {formatDateTime(ticket.reinstalledAt)}.
              </div>
              <div className="text-emerald-800">
                Location: <strong>{ticket.reinstalledLocation || 'Customer site'}</strong>
              </div>
              <div className="text-[11px] text-emerald-700 pt-1 border-t border-emerald-200">
                ✓ Serial unit record in Inventory was updated to <strong>INSTALLED</strong>. Repair journey successfully closed.
              </div>
            </div>
          )}

          {/* STAGE 7: WRITE_OFF */}
          {ticket.status === 'WRITE_OFF' && (
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-xs text-slate-800 space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-sm text-slate-900">
                <XCircle className="w-5 h-5 text-rose-600" />
                Terminal State: Unit Written Off / Scrap
              </div>
              <p className="text-slate-600">
                This hardware was written off as irreparable. Serial inventory status has been set to RETURNED/SCRAP.
              </p>
            </div>
          )}
        </div>

        {/* Audit Trail Timeline (Task 1 & Task 3) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                Lifecycle Audit Trail ({ticket.timeline.length} Transitions)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">Immutable chronological log</span>
          </div>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {ticket.timeline.map((entry, idx) => {
              const actor = users.find((u) => u.id === entry.userId);
              const isLatest = idx === ticket.timeline.length - 1;

              return (
                <div key={idx} className="relative group">
                  {/* Circle on the timeline */}
                  <div
                    className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                      isLatest
                        ? 'border-orange-500 ring-4 ring-orange-100'
                        : 'border-slate-400'
                    }`}
                  />

                  <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs space-y-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono">
                          {entry.status.replace(/_/g, ' ')}
                        </span>
                        {isLatest && (
                          <Badge variant="orange" className="text-[9px] py-0 px-1.5">
                            Current Stage
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {formatDateTime(entry.timestamp)}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>
                        Action by <strong>{actor?.name || entry.userId}</strong> ({actor?.role})
                      </span>
                    </div>

                    {entry.note && (
                      <div className="text-xs text-slate-700 italic pt-1 border-t border-slate-100">
                        &ldquo;{entry.note}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
    </Modal>
  );
};
