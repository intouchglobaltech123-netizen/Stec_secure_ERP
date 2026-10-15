import React, { useState, useMemo } from 'react';
import { humanize } from '@/lib/utils';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { RepairTicket } from '@/lib/stecsecure-types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wrench, Plus, Search, Building2, Cpu, FileText, CheckCircle2, HardHat } from 'lucide-react';
import { toast } from 'sonner';

interface CreateRepairTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialJobId?: string | null;
  initialCustomerId?: string;
  initialSerialUnitId?: string;
  // `ticket` is the newly created ticket returned by the server — use it instead of
  // looking the id up in context lists, which have not re-rendered yet at this point
  onSuccess?: (ticketId: string, ticket: RepairTicket) => void;
}

export const CreateRepairTicketModal: React.FC<CreateRepairTicketModalProps> = ({
  isOpen,
  onClose,
  initialJobId = null,
  initialCustomerId,
  initialSerialUnitId,
  onSuccess,
}) => {
  const {
    customers,
    addCustomer,
    products,
    serialUnits,
    jobs,
    users,
    currentUser,
    createRepairTicket,
  } = useStecSecure();

  const technicians = useMemo(() => users.filter((u) => u.role === 'TECHNICIAN'), [users]);

  // Selected customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');

  // Unit mode: 'CATALOGUED' (selected from SerialUnit) vs 'CUSTOM' (walk-in description)
  const [unitMode, setUnitMode] = useState<'CATALOGUED' | 'CUSTOM'>(
    initialSerialUnitId ? 'CATALOGUED' : 'CATALOGUED'
  );
  const [selectedSerialUnitId, setSelectedSerialUnitId] = useState<string>(initialSerialUnitId || '');
  const [serialSearch, setSerialSearch] = useState('');
  const [customUnitDescription, setCustomUnitDescription] = useState('');

  // Fault description & triage note
  const [faultDescription, setFaultDescription] = useState('');
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<string>('');
  const [initialNote, setInitialNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  // Sync initial props on open
  React.useEffect(() => {
    if (isOpen) {
      if (initialCustomerId) setSelectedCustomerId(initialCustomerId);
      if (initialSerialUnitId) {
        setSelectedSerialUnitId(initialSerialUnitId);
        setUnitMode('CATALOGUED');
      }
      if (!assignedTechnicianId) {
        if (currentUser?.role === 'TECHNICIAN') {
          setAssignedTechnicianId(currentUser.id);
        } else if (technicians.length > 0) {
          setAssignedTechnicianId(technicians[0].id);
        }
      }
    }
  }, [isOpen, initialCustomerId, initialSerialUnitId, currentUser, technicians, assignedTechnicianId]);

  // Linked Job
  const linkedJob = useMemo(() => {
    if (!initialJobId) return null;
    return jobs.find((j) => j.id === initialJobId);
  }, [initialJobId, jobs]);

  // Filtered customers for search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.address.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  // Available serial units:
  const availableSerials = useMemo(() => {
    const q = serialSearch.toLowerCase().trim();
    return serialUnits.filter((s) => {
      const prod = products.find((p) => p.id === s.productId);
      const matchesQuery =
        !q ||
        s.serialNumber.toLowerCase().includes(q) ||
        prod?.name.toLowerCase().includes(q) ||
        prod?.category.toLowerCase().includes(q);

      if (!matchesQuery) return false;

      // Only units out with customers; not warehouse stock, written-off units, or units already under repair
      if (s.status !== 'INSTALLED' && s.status !== 'ALLOCATED') return false;

      if (initialJobId && s.installedAtJobId === initialJobId) return true;
      if (selectedCustomerId) return s.soldToCustomerId === selectedCustomerId;
      return true;
    });
  }, [serialUnits, products, serialSearch, selectedCustomerId, initialJobId]);

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      toast.error('Customer name and phone number are required');
      return;
    }

    setIsAddingCustomer(true);
    try {
      const created = await addCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        address: newCustomerAddress.trim() || 'Address on file',
      });

      setSelectedCustomerId(created.id);
      setShowQuickAddCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
      toast.success(`Customer ${created.name} added!`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsAddingCustomer(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedCustomerId) {
      toast.error('Please select or add a customer');
      return;
    }

    if (unitMode === 'CATALOGUED' && !selectedSerialUnitId) {
      toast.error('Please select a serial unit, or switch to manual description');
      return;
    }

    if (unitMode === 'CUSTOM' && !customUnitDescription.trim()) {
      toast.error('Please enter the walk-in unit make/model/serial description');
      return;
    }

    if (!faultDescription.trim()) {
      toast.error('Please provide a fault description');
      return;
    }

    if (!assignedTechnicianId) {
      toast.error('Please assign a technician responsible for physical handling');
      return;
    }

    setIsSubmitting(true);
    try {
      const ticket = await createRepairTicket({
        customerId: selectedCustomerId,
        assignedTechnicianId,
        serialUnitId: unitMode === 'CATALOGUED' ? selectedSerialUnitId : undefined,
        customUnitDescription: unitMode === 'CUSTOM' ? customUnitDescription.trim() : undefined,
        sourceJobId: initialJobId || null,
        faultDescription: faultDescription.trim(),
        initialNote: initialNote.trim() || undefined,
      });

      toast.success(`Repair ticket ${ticket.ticketNumber} created successfully!`);
      onSuccess?.(ticket.id, ticket);
      handleResetAndClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSelectedCustomerId(initialCustomerId || '');
    setSelectedSerialUnitId(initialSerialUnitId || '');
    setUnitMode('CATALOGUED');
    setCustomUnitDescription('');
    setFaultDescription('');
    setAssignedTechnicianId(
      currentUser?.role === 'TECHNICIAN' ? currentUser.id : (technicians[0]?.id || '')
    );
    setInitialNote('');
    setShowQuickAddCustomer(false);
    onClose();
  };

  const activeCustomer = customers.find((c) => c.id === selectedCustomerId);
  const activeSerial = serialUnits.find((s) => s.id === selectedSerialUnitId);
  const activeProduct = activeSerial ? products.find((p) => p.id === activeSerial.productId) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleResetAndClose}
      title={initialJobId ? 'Send Unit for Repair' : 'New Repair Ticket'}
      subtitle={
        initialJobId
          ? `From job ${linkedJob?.jobNumber || initialJobId}`
          : 'Record the faulty unit and who will collect it'
      }
      icon={<Wrench className="w-5 h-5 text-orange-600" />}
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="hidden sm:block text-xs text-slate-500">
            Logged by: <strong className="text-slate-800">{currentUser?.name}</strong> ({humanize(currentUser?.role)})
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleResetAndClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleSubmit()}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold flex items-center gap-1.5 shadow-2xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              Create RMA Ticket
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 pt-1 font-sans">
        {/* Linked Job banner if from job */}
        {linkedJob && (
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between text-[13px] text-amber-900">
            <div className="flex items-center gap-2">
              <Badge variant="orange" className="font-mono text-[11px]">
                {linkedJob.jobNumber}
              </Badge>
              <span className="font-medium">
                {linkedJob.category} Service Call &bull; Customer: {activeCustomer?.name || linkedJob.customerNumber}
              </span>
            </div>
            <span className="text-[11px] text-amber-700 font-semibold uppercase tracking-wider">
              Source Job Linked
            </span>
          </div>
        )}

        {/* Section 1: Customer Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-orange-600" />
              1. Customer <span className="text-rose-500">*</span>
            </label>
            {!initialJobId && (
              <button
                type="button"
                onClick={() => setShowQuickAddCustomer(!showQuickAddCustomer)}
                className="text-[13px] font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {showQuickAddCustomer ? 'Choose existing customer' : 'New customer'}
              </button>
            )}
          </div>

          {showQuickAddCustomer ? (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-[13px] font-bold text-slate-800">New customer</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  placeholder="Full Name *"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="text-[13px] bg-white"
                />
                <Input
                  placeholder="Phone Number *"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="text-[13px] bg-white"
                />
              </div>
              <Input
                placeholder="Premises / Site Address"
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
                className="text-[13px] bg-white"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={isAddingCustomer}
                onClick={handleQuickAddCustomer}
                className="bg-orange-600 hover:bg-orange-700 text-white text-[13px] h-8"
              >
                Save &amp; Select Customer
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeCustomer ? (
                <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{activeCustomer.name}</div>
                    <div className="text-[13px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>📞 {activeCustomer.phone}</span>
                      <span>&bull;</span>
                      <span className="truncate max-w-[280px]">{activeCustomer.address}</span>
                    </div>
                  </div>
                  {!initialJobId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomerId('')}
                      className="text-[13px] text-slate-500 hover:text-slate-800 h-7"
                    >
                      Change
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <Input
                      placeholder="Search name, phone or place"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9 text-[13px] bg-white"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white shadow-2xs">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-3 text-[13px] text-slate-400 text-center">
                        No match. Use &quot;+ New customer&quot; above.
                      </div>
                    ) : (
                      filteredCustomers.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearch('');
                          }}
                          className="p-2.5 hover:bg-orange-50/60 cursor-pointer flex items-center justify-between text-[13px] transition-colors"
                        >
                          <div>
                            <span className="font-semibold text-slate-800">{c.name}</span>
                            <span className="text-slate-400 text-xs ml-2">({c.phone})</span>
                          </div>
                          <span className="text-xs text-slate-500 truncate max-w-[220px]">
                            {c.address}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Unit Selection */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[13px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
              <Cpu className="w-3.5 h-3.5 text-orange-600" />
              2. Faulty unit <span className="text-rose-500">*</span>
            </label>

            {/* Mode switch */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[13px]">
              <button
                type="button"
                onClick={() => setUnitMode('CATALOGUED')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  unitMode === 'CATALOGUED'
                    ? 'bg-white text-orange-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                From our stock
              </button>
              <button
                type="button"
                onClick={() => setUnitMode('CUSTOM')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  unitMode === 'CUSTOM'
                    ? 'bg-white text-orange-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Not from our stock
              </button>
            </div>
          </div>

          {unitMode === 'CATALOGUED' ? (
            <div className="space-y-2">
              {activeSerial ? (
                <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-orange-700">
                        {activeSerial.serialNumber}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        {activeProduct?.category || 'Hardware'}
                      </Badge>
                      <Badge
                        variant={
                          activeSerial.status === 'INSTALLED'
                            ? 'success'
                            : activeSerial.status === 'IN_STOCK'
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-[11px]"
                      >
                        {humanize(activeSerial.status)}
                      </Badge>
                    </div>
                    <div className="text-[13px] text-slate-700 mt-1 font-medium">
                      {activeProduct?.name || 'Unknown Product Model'}
                    </div>
                    {activeSerial.installedLocation && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Location: {activeSerial.installedLocation}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSerialUnitId('')}
                    className="text-[13px] text-slate-500 hover:text-slate-800 h-7"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <Input
                      placeholder="Search serial number or product"
                      value={serialSearch}
                      onChange={(e) => setSerialSearch(e.target.value)}
                      className="pl-9 text-[13px] bg-white"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white shadow-2xs">
                    {availableSerials.length === 0 ? (
                      <div className="p-3 text-[13px] text-slate-400 text-center">
                        No match. Choose &quot;Not from our stock&quot; above and type the details.
                      </div>
                    ) : (
                      availableSerials.map((s) => {
                        const p = products.find((prod) => prod.id === s.productId);
                        const isCustUnit = selectedCustomerId && s.soldToCustomerId === selectedCustomerId;
                        return (
                          <div
                            key={s.id}
                            onClick={() => {
                              setSelectedSerialUnitId(s.id);
                              setSerialSearch('');
                            }}
                            className="p-2.5 hover:bg-orange-50/60 cursor-pointer flex items-center justify-between text-[13px] transition-colors"
                          >
                            <div>
                              <span className="font-mono font-bold text-orange-600">
                                {s.serialNumber}
                              </span>
                              <span className="font-medium text-slate-800 ml-2">
                                {p?.name}
                              </span>
                              {isCustUnit && (
                                <span className="ml-2 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-sm font-semibold">
                                  Customer Unit
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">{p?.category}</span>
                              <Badge variant="outline" className="text-[11px]">
                                {humanize(s.status)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Make, model and serial number"
                value={customUnitDescription}
                onChange={(e) => setCustomUnitDescription(e.target.value)}
                className="text-[13px] bg-white font-mono"
              />
            </div>
          )}
        </div>

        {/* Section 3: Fault Description */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-orange-600" />
            3. Fault <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={3}
            required
            placeholder="What is wrong? e.g. no picture at night"
            value={faultDescription}
            onChange={(e) => setFaultDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Section 4: Assign Technician */}
        <div className="space-y-1.5 p-3.5 rounded-xl border border-orange-200 bg-orange-50/40">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <HardHat className="w-3.5 h-3.5 text-orange-600" />
              4. Technician <span className="text-rose-500">*</span>
            </span>
          </label>
          <select
            value={assignedTechnicianId}
            onChange={(e) => setAssignedTechnicianId(e.target.value)}
            className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
            required
          >
            <option value="" disabled>Who collects and reinstalls it?</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (Technician &bull; {t.phone})
              </option>
            ))}
          </select>
        </div>

        {/* Section 5: Initial Triage Note (Optional) */}
        <div className="space-y-1">
          <label className="text-[13px] font-semibold text-slate-700">
            5. Note (optional)
          </label>
          <Input
            placeholder="e.g. scratched, no adapter"
            value={initialNote}
            onChange={(e) => setInitialNote(e.target.value)}
            className="text-[13px] bg-white"
          />
        </div>
      </div>
    </Modal>
  );
};
