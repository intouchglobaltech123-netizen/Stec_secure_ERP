import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const FOUR_DIGITS = /^\d{4}$/;

// Phase 21: any staff member can change their own PIN (signs out their other devices)
export const ChangePinModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { changeOwnPin } = useStecSecure();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!FOUR_DIGITS.test(newPin)) {
      toast.error('The new PIN must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('The two new PINs do not match.');
      return;
    }
    setSaving(true);
    try {
      await changeOwnPin(currentPin, newPin);
      toast.success('PIN changed. Your other devices have been signed out.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pinInput = (label: string, value: string, onChange: (v: string) => void, autoFocus = false) => (
    <div>
      <label className="block text-[13px] font-semibold text-slate-700 mb-1">{label}</label>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="h-10 text-center font-mono text-base tracking-[0.5em]"
      />
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      title="Change my PIN"
      icon={<KeyRound className="w-5 h-5 text-orange-600" />}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {pinInput('Current PIN', currentPin, setCurrentPin, true)}
        {pinInput('New PIN', newPin, setNewPin)}
        {pinInput('New PIN again', confirmPin, setConfirmPin)}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Change PIN'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
