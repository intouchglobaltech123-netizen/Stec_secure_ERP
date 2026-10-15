import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Customer } from '@/lib/stecsecure-types';
import { X, MapPin, ExternalLink, Link2, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface SiteLocationModalProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved?: (updatedCustomer: Customer) => void;
}

export const SiteLocationModal: React.FC<SiteLocationModalProps> = ({
  isOpen,
  customer,
  onClose,
  onSaved,
}) => {
  const { updateCustomer } = useStecSecure();
  const [mapLink, setMapLink] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setMapLink(customer.siteLocationMapLink || '');
    } else {
      setMapLink('');
    }
  }, [customer, isOpen]);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLink = mapLink.trim();

    setSaving(true);
    try {
      await updateCustomer(customer.id, {
        siteLocationMapLink: cleanLink || undefined,
      });

      toast.success(
        cleanLink
          ? `Site location map link saved for ${customer.name}.`
          : `Site location link cleared for ${customer.name}.`
      );

      if (onSaved) {
        onSaved({
          ...customer,
          siteLocationMapLink: cleanLink || undefined,
        });
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateSearchLink = () => {
    const query = encodeURIComponent(`${customer.name}, ${customer.address}`);
    const generated = `https://www.google.com/maps/search/?api=1&query=${query}`;
    setMapLink(generated);
    toast.info('Generated Google Maps search link from customer address');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title="Site Location Map Link"
      subtitle="Google Maps GPS navigation coordinate / share URL"
      icon={<MapPin className="w-5 h-5" />}
    >
      <div className="space-y-4 text-xs">
        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="font-bold text-slate-900 flex items-center justify-between">
            <span>{customer.name}</span>
            <span className="text-[10px] font-mono text-orange-600">{customer.id}</span>
          </div>
          <div className="text-slate-600 text-[11px] flex items-start gap-1">
            <Navigation className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>{customer.address}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Site Location (Google Maps Link)
            </label>
            <div className="relative">
              <Link2 className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                type="url"
                placeholder="https://maps.app.goo.gl/..."
                value={mapLink}
                onChange={(e) => setMapLink(e.target.value)}
                className="pl-9 text-xs bg-white font-mono"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Paste a shared Google Maps pin, Plus Code, or short link.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleGenerateSearchLink}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline flex items-center gap-1"
            >
              Generate link from address
            </button>
            {mapLink.trim() && (
              <a
                href={mapLink.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 hover:underline"
              >
                <span>Test Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="rounded-xl">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving} className="rounded-xl font-semibold">
              Save Location Link
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
