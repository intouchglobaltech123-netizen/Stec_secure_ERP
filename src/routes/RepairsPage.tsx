import React, { useState, useMemo } from 'react';
import { localDateISO } from '@/lib/numbering';
import { useStecSecure } from '@/lib/stecsecure-context';
import { RepairTicket, RepairStatus, RepairPath } from '@/lib/stecsecure-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  Send,
  Building2,
  RotateCcw,
  HardHat,
} from 'lucide-react';
import { CreateRepairTicketModal } from '@/components/repairs/CreateRepairTicketModal';
import { RepairTicketDetailModal } from '@/components/repairs/RepairTicketDetailModal';

interface RepairsPageProps {
  onNavigateToJob?: (jobId: string) => void;
}

export const RepairsPage: React.FC<RepairsPageProps> = ({ onNavigateToJob }) => {
  const {
    visibleRepairTickets,
    customers,
    serialUnits,
    products,
    vendors,
    users,
    currentUser,
  } = useStecSecure();

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RepairStatus>('ALL');
  const [pathFilter, setPathFilter] = useState<'ALL' | RepairPath>('ALL');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // Computed metrics
  // India date, recomputed each render so it rolls over at midnight
  const todayStr = localDateISO();

  const overdueTickets = useMemo(() => {
    return visibleRepairTickets.filter(
      (t) =>
        t.status === 'SENT_TO_VENDOR' &&
        t.vendorExpectedReturnDate &&
        todayStr > t.vendorExpectedReturnDate
    );
  }, [visibleRepairTickets, todayStr]);

  const inHouseCount = useMemo(
    () => visibleRepairTickets.filter((t) => t.status === 'IN_HOUSE_REPAIR').length,
    [visibleRepairTickets]
  );

  const vendorCount = useMemo(
    () => visibleRepairTickets.filter((t) => t.status === 'SENT_TO_VENDOR').length,
    [visibleRepairTickets]
  );

  const readyOrReinstalledCount = useMemo(
    () =>
      visibleRepairTickets.filter(
        (t) => t.status === 'READY_TO_REINSTALL' || t.status === 'REINSTALLED'
      ).length,
    [visibleRepairTickets]
  );

  // Filtered ticket list
  const filteredTickets = useMemo(() => {
    return visibleRepairTickets.filter((ticket) => {
      // Overdue filter toggle
      const isTicketOverdue =
        ticket.status === 'SENT_TO_VENDOR' &&
        ticket.vendorExpectedReturnDate &&
        todayStr > ticket.vendorExpectedReturnDate;

      if (showOverdueOnly && !isTicketOverdue) return false;

      // Status filter
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false;

      // Path filter
      if (pathFilter !== 'ALL' && ticket.repairPath !== pathFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cust = customers.find((c) => c.id === ticket.customerId);
        const serial = serialUnits.find((s) => s.id === ticket.serialUnitId);
        const prod = serial ? products.find((p) => p.id === serial.productId) : null;
        const vend = vendors.find((v) => v.id === ticket.vendorId);
        const assignedTech = users.find((u) => u.id === ticket.assignedTechnicianId);

        const matches =
          ticket.ticketNumber.toLowerCase().includes(q) ||
          ticket.faultDescription.toLowerCase().includes(q) ||
          cust?.name.toLowerCase().includes(q) ||
          cust?.phone.includes(q) ||
          serial?.serialNumber.toLowerCase().includes(q) ||
          prod?.name.toLowerCase().includes(q) ||
          vend?.name.toLowerCase().includes(q) ||
          assignedTech?.name.toLowerCase().includes(q) ||
          (ticket.customUnitDescription && ticket.customUnitDescription.toLowerCase().includes(q));

        if (!matches) return false;
      }

      return true;
    });
  }, [
    visibleRepairTickets,
    statusFilter,
    pathFilter,
    showOverdueOnly,
    searchQuery,
    customers,
    serialUnits,
    products,
    vendors,
    users,
    todayStr,
  ]);

  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return visibleRepairTickets.find((t) => t.id === selectedTicketId) || null;
  }, [selectedTicketId, visibleRepairTickets]);

  // Status pill renderer
  const renderStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case 'FAULT_REPORTED':
        return <Badge variant="warning">Fault Reported</Badge>;
      case 'PICKED_UP':
        return <Badge variant="orange">Picked Up</Badge>;
      case 'CHECKED_IN_AT_OFFICE':
        return <Badge variant="default">At Office Lab</Badge>;
      case 'IN_HOUSE_REPAIR':
        return <Badge variant="orange">In-House Bench</Badge>;
      case 'SENT_TO_VENDOR':
        return <Badge variant="danger">Sent to Vendor</Badge>;
      case 'READY_TO_REINSTALL':
        return <Badge variant="success">Ready to Reinstall</Badge>;
      case 'REINSTALLED':
        return <Badge variant="success">Reinstalled & Closed</Badge>;
      case 'WRITE_OFF':
        return <Badge variant="secondary">Write-Off</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper: days in current stage
  const getDaysInStage = (ticket: RepairTicket) => {
    if (!ticket.timeline || ticket.timeline.length === 0) return 0;
    const latest = ticket.timeline[ticket.timeline.length - 1];
    const latestTime = new Date(latest.timestamp).getTime();
    if (isNaN(latestTime)) return 0;
    const diffMs = Date.now() - latestTime;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="w-full space-y-6">
      {/* Page Header Banner */}
      <div className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-50 via-white to-amber-50/50 border border-orange-200/80 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="orange" className="text-xs">
                <RotateCcw className="w-3 h-3 text-orange-600" />
                Physical Unit Lifecycle
              </Badge>
              <span className="text-xs text-slate-500 font-medium">
                Distinct from Job Labor Tasks &bull; Hardware RMA &amp; Bench Tracking
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
              Repair
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              Track physical equipment from site fault pickup, service lab check-in, in-house bench repairs, vendor warranty RMAs, and customer reinstallation back into active inventory.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {currentUser?.role === 'TECHNICIAN' && (
              <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-2 rounded-xl text-xs font-semibold text-orange-950">
                <HardHat className="w-4 h-4 text-orange-600" />
                <span>Assigned Tasks ({visibleRepairTickets.length})</span>
              </div>
            )}
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs h-10 px-4 shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Repair Ticket
            </Button>
          </div>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Total RMA Tickets</span>
            <RotateCcw className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {visibleRepairTickets.length}
          </div>
          <p className="text-[11px] text-slate-500">Across all repair stages</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-orange-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-orange-800 text-[11px] font-bold uppercase tracking-wider">
            <span>In-House Bench</span>
            <Wrench className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-extrabold text-orange-900 font-mono">
            {inHouseCount}
          </div>
          <p className="text-[11px] text-orange-700">Under technician triage</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-blue-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-blue-800 text-[11px] font-bold uppercase tracking-wider">
            <span>Sent to Vendor</span>
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-blue-900 font-mono">
            {vendorCount}
          </div>
          <p className="text-[11px] text-blue-700">External warranty dispatch</p>
        </div>

        {/* Overdue Vendor Repairs Metric Tile (Task 4) */}
        <div
          onClick={() => {
            setShowOverdueOnly(true);
            setStatusFilter('ALL');
          }}
          className={`p-4 rounded-xl border shadow-2xs space-y-1 cursor-pointer transition-all ${
            overdueTickets.length > 0
              ? 'bg-rose-50/70 border-rose-300 hover:border-rose-400 hover:shadow-md ring-1 ring-rose-200'
              : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
            <span className={overdueTickets.length > 0 ? 'text-rose-900' : 'text-slate-500'}>
              Overdue Vendor Repairs
            </span>
            <AlertTriangle
              className={`w-4 h-4 ${
                overdueTickets.length > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-400'
              }`}
            />
          </div>
          <div
            className={`text-2xl font-extrabold font-mono ${
              overdueTickets.length > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {overdueTickets.length}
          </div>
          <p
            className={`text-[11px] ${
              overdueTickets.length > 0 ? 'text-rose-800 font-medium' : 'text-slate-500'
            }`}
          >
            {overdueTickets.length > 0
              ? 'Click to filter delayed units'
              : 'All vendors on schedule'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-emerald-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
            <span>Ready / Reinstalled</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-900 font-mono">
            {readyOrReinstalledCount}
          </div>
          <p className="text-[11px] text-emerald-700">Restored to service</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Search by RMA #, customer, serial number, model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  if (e.target.value !== 'ALL') setShowOverdueOnly(false);
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Statuses ({visibleRepairTickets.length})</option>
                <option value="FAULT_REPORTED">FAULT_REPORTED</option>
                <option value="PICKED_UP">PICKED_UP</option>
                <option value="CHECKED_IN_AT_OFFICE">CHECKED_IN_AT_OFFICE</option>
                <option value="IN_HOUSE_REPAIR">IN_HOUSE_REPAIR</option>
                <option value="SENT_TO_VENDOR">SENT_TO_VENDOR</option>
                <option value="READY_TO_REINSTALL">READY_TO_REINSTALL</option>
                <option value="REINSTALLED">REINSTALLED</option>
                <option value="WRITE_OFF">WRITE_OFF</option>
              </select>
            </div>

            {/* Path Filter */}
            <select
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value as any)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Repair Paths</option>
              <option value="IN_HOUSE">In-House Only</option>
              <option value="VENDOR">Vendor Only</option>
            </select>

            {/* Overdue toggle button */}
            <button
              type="button"
              onClick={() => setShowOverdueOnly(!showOverdueOnly)}
              className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                showOverdueOnly
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Overdue Only ({overdueTickets.length})</span>
            </button>

            {(searchQuery || statusFilter !== 'ALL' || pathFilter !== 'ALL' || showOverdueOnly) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setPathFilter('ALL');
                  setShowOverdueOnly(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 h-9"
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Tickets Table (Task 5 View) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/90 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3.5">Ticket No.</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Hardware / Serial Unit</th>
                <th className="p-3.5">Assigned Tech</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Repair Path</th>
                <th className="p-3.5">Days in Stage</th>
                <th className="p-3.5">Alerts / SLA</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                    No repair tickets matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const cust = customers.find((c) => c.id === ticket.customerId);
                  const serial = serialUnits.find((s) => s.id === ticket.serialUnitId);
                  const prod = serial ? products.find((p) => p.id === serial.productId) : null;
                  const assignedTech = users.find((u) => u.id === ticket.assignedTechnicianId);
                  const daysInStage = getDaysInStage(ticket);

                  const isTicketOverdue =
                    ticket.status === 'SENT_TO_VENDOR' &&
                    ticket.vendorExpectedReturnDate &&
                    todayStr > ticket.vendorExpectedReturnDate;

                  const overdueDaysCount =
                    isTicketOverdue && ticket.vendorExpectedReturnDate
                      ? Math.max(
                          1,
                          Math.floor(
                            (new Date().getTime() - new Date(ticket.vendorExpectedReturnDate).getTime()) /
                              (1000 * 60 * 60 * 24)
                          )
                        )
                      : 0;

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className="hover:bg-orange-50/40 cursor-pointer transition-colors"
                    >
                      {/* Ticket Number */}
                      <td className="p-3.5 font-mono font-bold text-orange-600">
                        {ticket.ticketNumber}
                        {ticket.sourceJobId && (
                          <div className="text-[10px] font-normal text-slate-400">
                            From Job: {ticket.sourceJobId}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900">
                          {cust?.name || 'Walk-In Customer'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {cust?.phone || 'No phone'}
                        </div>
                      </td>

                      {/* Serial Unit & Product */}
                      <td className="p-3.5 max-w-[200px]">
                        {serial ? (
                          <div>
                            <div className="font-mono font-bold text-slate-800 text-xs truncate">
                              {serial.serialNumber}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {prod?.name || 'Hardware Unit'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono font-medium text-slate-800 text-xs truncate">
                              {ticket.customUnitDescription || 'Walk-in equipment'}
                            </div>
                            <span className="text-[10px] text-slate-400">Uncatalogued</span>
                          </div>
                        )}
                      </td>

                      {/* Assigned Technician */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <HardHat className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                          <span>{assignedTech?.name || 'Unassigned'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {ticket.assignedTechnicianId === currentUser?.id ? (
                            <span className="text-orange-600 font-semibold">Assigned to you</span>
                          ) : (
                            'Physical Custody'
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">{renderStatusBadge(ticket.status)}</td>

                      {/* Repair Path */}
                      <td className="p-3.5">
                        {ticket.repairPath === 'IN_HOUSE' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-orange-800 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded text-[11px]">
                            <Wrench className="w-3 h-3 text-orange-600" /> In-House
                          </span>
                        ) : ticket.repairPath === 'VENDOR' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                            <Send className="w-3 h-3 text-blue-600" /> Vendor
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Days in current stage */}
                      <td className="p-3.5 font-mono text-xs text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {daysInStage} {daysInStage === 1 ? 'day' : 'days'}
                        </span>
                      </td>

                      {/* Overdue SLA Flag (Task 4) */}
                      <td className="p-3.5">
                        {isTicketOverdue ? (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[10px] animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                            Overdue by {overdueDaysCount}d
                          </span>
                        ) : ticket.status === 'SENT_TO_VENDOR' && ticket.vendorExpectedReturnDate ? (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Due {ticket.vendorExpectedReturnDate}
                          </span>
                        ) : ticket.status === 'REINSTALLED' ? (
                          <span className="text-[10px] text-emerald-600 font-medium">Closed</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">On Schedule</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="p-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicketId(ticket.id);
                          }}
                          className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-semibold h-8"
                        >
                          View Details <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CreateRepairTicketModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={(ticketId) => {
          setSelectedTicketId(ticketId);
        }}
      />

      <RepairTicketDetailModal
        ticket={selectedTicket}
        isOpen={Boolean(selectedTicketId)}
        onClose={() => setSelectedTicketId(null)}
        onNavigateToJob={onNavigateToJob}
      />
    </div>
  );
};
