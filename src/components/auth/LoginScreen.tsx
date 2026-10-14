import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { UserRole } from '@/lib/stecsecure-types';
import { Shield, Lock, UserCheck, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COMPANY_LOGO_SRC } from '@/components/layout/AppShell';
import { toast } from 'sonner';

export const LoginScreen: React.FC = () => {
  const { users, loginWithPin, loginAsUser } = useStecSecure();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) {
        submitPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const submitPin = (pinToSubmit: string) => {
    const res = loginWithPin(pinToSubmit);
    if (res.success) {
      toast.success('Logged in successfully.');
    } else {
      setError(res.message || 'Invalid PIN');
      setPin('');
      toast.error('Invalid PIN. Please try again or click a demo profile.');
    }
  };

  const handleQuickLogin = (userId: string, userName: string, role: string) => {
    loginAsUser(userId);
    toast.success(`Logged in as ${userName} (${role})`);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-50 px-4 py-8 overflow-hidden text-slate-900">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-white border border-slate-200 shadow-sm mb-1">
            <img
              src={COMPANY_LOGO_SRC}
              alt="S Tec Secure"
              className="h-10 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-2 font-display">
            <span>S Tec</span>
            <span className="text-orange-600">Secure</span>
            <span className="text-xs uppercase font-mono font-bold px-2 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
              ERP
            </span>
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto font-medium">
            Surveillance & Automation Operations ERP
          </p>
        </div>

        {/* PIN Login Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xl space-y-6 border border-slate-200 text-slate-900">
          <div className="text-center space-y-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center justify-center gap-2 font-display">
              <KeyRound className="w-4 h-4 text-orange-600" /> Enter 4-Digit Security PIN
            </h2>
            <p className="text-xs text-slate-500">
              Access the command console with your assigned PIN
            </p>
          </div>

          {/* PIN Dots Indicator */}
          <div className="flex justify-center items-center gap-4 py-2">
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = pin.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    isFilled
                      ? 'bg-orange-500 scale-110 shadow-md shadow-orange-500/40'
                      : 'border-2 border-slate-300 bg-slate-100'
                  }`}
                />
              );
            })}
          </div>

          {error && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-rose-700 bg-rose-50 py-2 px-3 rounded-lg border border-rose-200 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-lg font-bold text-slate-800 border border-slate-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-mono"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleDelete}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-xs font-semibold text-slate-600 border border-slate-200 transition-all flex items-center justify-center cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-lg font-bold text-slate-800 border border-slate-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-mono"
            >
              0
            </button>
            <button
              type="button"
              disabled={pin.length !== 4}
              onClick={() => submitPin(pin)}
              className="h-12 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:pointer-events-none active:scale-95 text-xs font-semibold text-white transition-all flex items-center justify-center cursor-pointer shadow-sm shadow-orange-500/25"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-slate-500 font-bold tracking-wider text-[10px]">
                Or One-Click Demo Login
              </span>
            </div>
          </div>

          {/* Quick Demo Personas */}
          <div className="space-y-2">
            {users.map((u) => {
              const roleColor =
                u.role === 'CEO'
                  ? 'border-orange-200 hover:border-orange-300 bg-orange-50/40 text-orange-950'
                  : u.role === 'MANAGER'
                  ? 'border-blue-200 hover:border-blue-300 bg-blue-50/40 text-blue-950'
                  : 'border-emerald-200 hover:border-emerald-300 bg-emerald-50/40 text-emerald-950';

              const roleBadge =
                u.role === 'CEO'
                  ? 'bg-orange-100 text-orange-800 border-orange-200'
                  : u.role === 'MANAGER'
                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200';

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleQuickLogin(u.id, u.name, u.role)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left group cursor-pointer shadow-2xs ${roleColor}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-800 shadow-2xs">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                        {u.name}
                      </div>
                      <div className="text-[11px] text-slate-500">PIN: {u.pin}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${roleBadge}`}>
                      {u.role}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-600 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 font-medium">
          S Tec Secure (Surveillance & Automation's) &copy; {new Date().getFullYear()} &bull; Erode, Tamil Nadu
        </p>
      </div>
    </div>
  );
};
