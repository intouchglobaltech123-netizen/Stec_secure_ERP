import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Download } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BackupInfo {
  lastBackup: { at: string; byName: string; records: number; photos: number; includesPhotos?: boolean } | null;
  records: number;
  photos: number;
  photoBytes: number;
}

const REMIND_AFTER_DAYS = 7;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

// Step 3: the CEO downloads a full copy of the business data to keep outside the server (laptop,
// Google Drive). PINs are not included — after a restore, the CEO sets staff PINs again.
export const BackupCard: React.FC = () => {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [error, setError] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);

  const load = () =>
    api<BackupInfo>('/admin/backup/info')
      .then((i) => {
        setInfo(i);
        setError('');
      })
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const last = info?.lastBackup;
  const daysSince = last ? Math.floor((Date.now() - new Date(last.at).getTime()) / 86_400_000) : null;
  const due = daysSince === null || daysSince >= REMIND_AFTER_DAYS;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900 flex items-center gap-2">
          <DatabaseBackup className="w-5 h-5 text-orange-600" /> Backups
        </CardTitle>
        <CardDescription className="text-slate-500">
          Download a copy of all business data — customers, jobs, quotations, invoices, payments, stock and photos —
          and keep it somewhere safe outside this server (your laptop or Google Drive). Staff PINs are not included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {error && <p className="text-rose-600">{error}</p>}
        {info && (
          <div
            className={`rounded-lg border p-3 ${
              due ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {last ? (
              <>
                Last backup: <strong>{formatDateTime(last.at)}</strong> by {last.byName} ({plural(last.records, 'record')}
                {last.includesPhotos === false ? ', without photos' : `, ${plural(last.photos, 'photo')}`})
                {due && <> — over {REMIND_AFTER_DAYS} days ago. Please download a fresh copy.</>}
              </>
            ) : (
              <>No backup has been downloaded yet. Please download one now and keep it safe.</>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/admin/backup${includePhotos ? '' : '?photos=0'}`}
            download
            onClick={() => setTimeout(load, 4000)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold"
          >
            <Download className="w-4 h-4" /> Download backup
          </a>
          <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
            <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
            Include job photos
          </label>
          {info && (
            <Badge variant="secondary" className="text-[10px]">
              {plural(info.records, 'record')} · {plural(info.photos, 'photo')} ({megabytes(info.photoBytes)})
            </Badge>
          )}
        </div>
        <p className="text-slate-500">
          Recommended: download one every week (more often during busy periods). Restoring a backup is done by the
          developer with the restore script — see docs/DEPLOY-RAILWAY.md.
        </p>
      </CardContent>
    </Card>
  );
};
