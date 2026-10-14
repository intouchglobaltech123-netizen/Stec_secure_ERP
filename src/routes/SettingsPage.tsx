import React from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Settings, RefreshCw, Database, Shield, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export const SettingsPage: React.FC = () => {
  const { currentUser, resetToDemoData, users, products, serialUnits, jobs } = useStecSecure();

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all data back to the demo baseline? Any changes will be restored.')) {
      resetToDemoData();
      toast.success('System state reset to initial seed data.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="orange" className="text-xs">
            <Settings className="w-3.5 h-3.5 text-orange-600" />
            System Configuration
          </Badge>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
          ERP Settings & System Environment
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Environment configuration, local storage diagnostics, and demo utilities
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System & Storage Diagnostics */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-orange-600" />
              Storage & Persistence
            </CardTitle>
            <CardDescription className="text-slate-500">
              Client-side mock engine active with browser localStorage persistence
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Storage Key:</span>
              <span className="font-mono text-orange-600 font-bold">stecsecure_erp_v1</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Total Products:</span>
              <span className="font-semibold text-slate-900 font-mono">{products.length} products</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Tracked Serial Units:</span>
              <span className="font-semibold text-slate-900 font-mono">{serialUnits.length} units</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Active Jobs:</span>
              <span className="font-semibold text-slate-900 font-mono">{jobs.length} jobs</span>
            </div>
          </CardContent>
        </Card>

        {/* Demo Controls */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
              Demo Data Reset
            </CardTitle>
            <CardDescription className="text-slate-500">
              Restore seed data anytime during presentation or demo testing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Clicking reset will restore the full CCTV & automation catalogue, 15 serial items, sample jobs (including the pending OTP and Hold events), and invoices back to their factory demo baseline.
            </p>
            <Button variant="danger" size="md" onClick={handleReset} className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" /> Reset All Demo Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
