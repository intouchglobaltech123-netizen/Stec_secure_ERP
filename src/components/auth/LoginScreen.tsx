import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { KeyRound, AlertCircle, ArrowRight, Phone, Loader2 } from 'lucide-react';
import { COMPANY_LOGO_SRC } from '@/components/layout/AppShell';
import { toast } from 'sonner';
import { DEMO_MODE } from '@/lib/demo-mode';
import { SEED_USERS } from '@/lib/seed-data';
import { DEMO_ACCOUNT_PINS } from '@/lib/demo-accounts';

// Phase 21: staff log in with their mobile number and 4-digit PIN, checked by the server
export const LoginScreen: React.FC = () => {
  const { login } = useStecSecure();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneDigits = phone.replace(/\D/g, '').slice(-10);
  const phoneValid = phoneDigits.length === 10;

  const submit = async (phoneToSubmit: string, pinToSubmit: string) => {
    if (submitting) return;
    if (phoneToSubmit.replace(/\D/g, '').length < 10) {
      setError('Enter your 10-digit mobile number first.');
      setPin('');
      return;
    }
    setSubmitting(true);
    const res = await login(phoneToSubmit, pinToSubmit);
    setSubmitting(false);
    if (res.success) {
      toast.success('Logged in successfully.');
    } else {
      setError(res.message || 'Wrong phone number or PIN.');
      setPin('');
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 4 && !submitting) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) {
        void submit(phone, newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  // Physical keyboard support: digits, Backspace, Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when the phone number input is focused
      const phoneInput = document.getElementById('login-phone');
      if (document.activeElement === phoneInput) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Enter' && pin.length === 4 && phoneValid && !submitting) {
        e.preventDefault();
        void submit(phone, pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, phone, phoneValid, submitting]);

  const handleDemoLogin = (demoPhone: string, demoPin: string) => {
    setPhone(demoPhone);
    setPin(demoPin);
    void submit(demoPhone, demoPin);
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
            <span className="text-[13px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
              ERP
            </span>
          </h1>
          <p className="text-[13px] text-slate-500 max-w-xs mx-auto font-medium">
            Surveillance & Automation Operations ERP
          </p>
        </div>

        {/* Phone + PIN Login Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xl space-y-5 border border-slate-200 text-slate-900">
          <div className="text-center space-y-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center justify-center gap-2 font-display">
              <KeyRound className="w-4 h-4 text-orange-600" /> Staff Login
            </h2>
            <p className="text-[13px] text-slate-500">Enter your mobile number, then your 4-digit PIN</p>
          </div>

          <div>
            <label htmlFor="login-phone" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Mobile number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98xxxxxxxx"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  // Only allow digits, max 10
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setPhone(digits);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  // On Enter after 10 digits, blur so PIN keyboard listener takes over
                  if (e.key === 'Enter' && phoneValid) {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-300 bg-white text-base font-mono tracking-wide text-slate-900 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* PIN Dots Indicator */}
          <div className="flex justify-center items-center gap-4 py-1">
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
            <div className="flex items-center justify-center gap-1.5 text-[13px] text-rose-700 bg-rose-50 py-2 px-3 rounded-lg border border-rose-200 font-medium">
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
                disabled={submitting}
                onClick={() => handleKeypadPress(digit)}
                className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-lg font-bold text-slate-800 border border-slate-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-mono disabled:opacity-50"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleDelete}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[13px] font-semibold text-slate-600 border border-slate-200 transition-all flex items-center justify-center cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleKeypadPress('0')}
              className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-lg font-bold text-slate-800 border border-slate-200 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-mono disabled:opacity-50"
            >
              0
            </button>
            <button
              type="button"
              aria-label="Log in"
              disabled={pin.length !== 4 || !phoneValid || submitting}
              onClick={() => void submit(phone, pin)}
              className="h-12 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:pointer-events-none active:scale-95 text-[13px] font-semibold text-white transition-all flex items-center justify-center cursor-pointer shadow-sm shadow-orange-500/25"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </div>

          <p className="text-center text-xs text-slate-500">
            Forgot your PIN? Ask the CEO to reset it in Settings → Staff Accounts.
          </p>

          {/* Demo logins (demo data only) */}
          {DEMO_MODE && (
            <div className="space-y-2 pt-1">
              <div className="text-center text-[11px] uppercase font-bold tracking-wider text-slate-500">
                Demo accounts
              </div>
              {SEED_USERS.filter((u) => DEMO_ACCOUNT_PINS[u.id]).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDemoLogin(u.phone, DEMO_ACCOUNT_PINS[u.id])}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:border-orange-300 bg-slate-50/60 transition-all text-left cursor-pointer text-[13px]"
                >
                  <span className="font-bold text-slate-900">{u.name}</span>
                  <span className="text-slate-500 font-mono">
                    {u.phone} · PIN {DEMO_ACCOUNT_PINS[u.id]} · {u.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-[13px] text-slate-500 font-medium">
          S Tec Secure (Surveillance & Automation's) &copy; {new Date().getFullYear()} &bull; Erode, Tamil Nadu
        </p>
      </div>
    </div>
  );
};
