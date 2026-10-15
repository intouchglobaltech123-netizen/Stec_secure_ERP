import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Customer } from '@/lib/stecsecure-types';
import { X, Users, MapPin, Phone, Mail, Building, User, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

interface CustomerModalProps {
  isOpen: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSaved?: (savedCustomer: Customer) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  customer,
  onClose,
  onSaved,
}) => {
  const { addCustomer, updateCustomer } = useStecSecure();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [gstin, setGstin] = useState('');
  const [siteLocationMapLink, setSiteLocationMapLink] = useState('');
  const [amcActive, setAmcActive] = useState(false);
  const [amcRenewalDate, setAmcRenewalDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setAddress(customer.address || '');
      setContactPerson(customer.contactPerson || '');
      setGstin(customer.gstin || '');
      setSiteLocationMapLink(customer.siteLocationMapLink || '');
      setAmcActive(Boolean(customer.amcActive));
      setAmcRenewalDate(customer.amcRenewalDate || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setContactPerson('');
      setGstin('');
      setSiteLocationMapLink('');
      setAmcActive(false);
      setAmcRenewalDate('');
    }
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!phone.trim()) {
      toast.error('Customer phone number is required');
      return;
    }
    if (!address.trim()) {
      toast.error('Customer site address is required');
      return;
    }

    setSaving(true);
    try {
      if (customer) {
        await updateCustomer(customer.id, {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim(),
          contactPerson: contactPerson.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          siteLocationMapLink: siteLocationMapLink.trim() || undefined,
          amcActive,
          amcRenewalDate: amcActive && amcRenewalDate ? amcRenewalDate : undefined,
        });

        const updated = {
          ...customer,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim(),
          contactPerson: contactPerson.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          siteLocationMapLink: siteLocationMapLink.trim() || undefined,
          amcActive,
          amcRenewalDate: amcActive && amcRenewalDate ? amcRenewalDate : undefined,
        };

        toast.success(`Customer ${name} updated successfully.`);
        if (onSaved) onSaved(updated);
      } else {
        const created = await addCustomer({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim(),
          contactPerson: contactPerson.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          siteLocationMapLink: siteLocationMapLink.trim() || undefined,
          amcActive,
          amcRenewalDate: amcActive && amcRenewalDate ? amcRenewalDate : undefined,
        });

        toast.success(`Customer ${created.name} (${created.id}) created.`);
        if (onSaved) onSaved(created);
      }

      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      showCloseButton={false}
      className="max-h-[90vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              {customer ? `Edit Customer: ${customer.name}` : 'Add New Customer'}
            </h2>
            <p className="text-xs text-slate-500">
              {customer ? `ID: ${customer.id}` : 'Create a client account & site profile'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 overscroll-contain">
          {/* Customer Name */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Client / Society / Business Name <span className="text-rose-500">*</span>
            </label>
            <Input
              placeholder="e.g. Greenfield Elite Villas RWA"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs bg-white"
              required
            />
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Primary Phone <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="9841100222"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9 text-xs bg-white font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-xs bg-white"
                />
              </div>
            </div>
          </div>

          {/* Contact Person & GSTIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Contact Person</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="Mr. Parthasarathy (President)"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="pl-9 text-xs bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">GSTIN (Optional)</label>
              <div className="relative">
                <Building className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="33AABCG1234F1Z5"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  className="pl-9 text-xs bg-white font-mono uppercase"
                />
              </div>
            </div>
          </div>

          {/* Site Address */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Site / Premises Address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Plot 42, OMR IT Corridor, Thoraipakkam, Chennai - 600097"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="pl-9 text-xs bg-white"
                required
              />
            </div>
          </div>

          {/* Site Location (Google Maps Link) */}
          <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200 space-y-1.5">
            <label className="block text-slate-900 font-semibold text-xs flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-orange-600" />
              Site Location (Google Maps Link)
            </label>
            <div className="relative">
              <Input
                type="url"
                placeholder="https://maps.app.goo.gl/..."
                value={siteLocationMapLink}
                onChange={(e) => setSiteLocationMapLink(e.target.value)}
                className="text-xs bg-white font-mono"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
              <span>Used by field technicians on job cards & navigation routes</span>
              {siteLocationMapLink.trim() && (
                <a
                  href={siteLocationMapLink.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-700 hover:text-orange-800 font-semibold flex items-center gap-0.5"
                >
                  <span>Test Link</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>

          {/* AMC Details */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={amcActive}
                onChange={(e) => setAmcActive(e.target.checked)}
                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
              />
              <span className="text-slate-800 font-medium">Active AMC Contract</span>
            </label>

            {amcActive && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Renewal Date:</span>
                <Input
                  type="date"
                  value={amcRenewalDate}
                  onChange={(e) => setAmcRenewalDate(e.target.value)}
                  className="text-xs h-8 w-36 bg-white"
                />
              </div>
            )}
          </div>

        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving} className="rounded-xl font-semibold">
            {customer ? 'Save Changes' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
