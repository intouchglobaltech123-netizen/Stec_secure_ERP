import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { Vendor } from '@/lib/stecsecure-types';
import { X, Building2, Phone, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';

interface VendorModalProps {
  isOpen: boolean;
  vendor?: Vendor | null;
  onClose: () => void;
}

export const VendorModal: React.FC<VendorModalProps> = ({ isOpen, vendor, onClose }) => {
  const { addVendor, updateVendor } = useStecSecure();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendor) {
      setName(vendor.name);
      setPhone(vendor.phone);
      setAddress(vendor.address);
      setGstin(vendor.gstin || '');
      setContactPerson(vendor.contactPerson || '');
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setGstin('');
      setContactPerson('');
    }
  }, [vendor, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim()) {
      toast.error('Please enter vendor name, phone, and address');
      return;
    }

    setSaving(true);
    try {
      if (vendor) {
        await updateVendor(vendor.id, {
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          gstin: gstin.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
        });
        toast.success(`Vendor ${name} updated.`);
      } else {
        const created = await addVendor({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          gstin: gstin.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
        });
        toast.success(`Vendor ${created.name} registered.`);
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
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              {vendor ? 'Edit Supplier / Vendor' : 'Add New Supplier / Vendor'}
            </h2>
            <p className="text-xs text-slate-500">
              Register vendor/OEM details, warehouse location, contact and GSTIN
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Vendor / OEM Name *</label>
            <Input
              required
              placeholder="e.g. Hikvision India Pvt Ltd / CP Plus Regional Hub"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs h-9 bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
              <Input
                placeholder="e.g. Ramesh Kumar (Sales Mgr)"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="text-xs h-9 bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
              <Input
                required
                placeholder="e.g. 044-28994883 / 98401 23456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Warehouse Address *</label>
            <Input
              required
              placeholder="e.g. 104 Mount Road, Guindy Industrial Estate, Chennai"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="text-xs h-9 bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">GSTIN (Optional)</label>
            <Input
              placeholder="e.g. 33AABCH1234F1Z8"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className="text-xs h-9 font-mono uppercase bg-white"
            />
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button type="button" variant="secondary" size="md" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={saving} className="rounded-xl font-semibold bg-orange-600 hover:bg-orange-700 text-white">
            <ShieldCheck className="w-4 h-4 mr-1.5" />
            {vendor ? 'Save Changes' : 'Add Vendor'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
