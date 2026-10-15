import React, { useRef } from 'react';
import { Camera, UploadCloud, X, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { compressImageFile } from '@/lib/image-utils';
import { DEMO_MODE } from '@/lib/demo-mode';

interface JobPhotoUploadProps {
  label: string;
  description?: string;
  photoUrl?: string;
  onPhotoChange: (url: string | undefined) => void;
  required?: boolean;
  samplePhotoFallback?: string;
  className?: string;
}

export const JobPhotoUpload: React.FC<JobPhotoUploadProps> = ({
  label,
  description,
  photoUrl,
  onPhotoChange,
  required = false,
  samplePhotoFallback,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photos are resized/compressed before storing — full-size camera images overflow browser storage
  const acceptFile = async (file: File) => {
    try {
      onPhotoChange(await compressImageFile(file));
    } catch {
      toast.error('Could not read that photo. Please try another image.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void acceptFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    void acceptFile(file);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-orange-600" />
          {label}
          {required && <span className="text-rose-500 text-[13px] font-bold">*</span>}
        </label>
        {photoUrl && (
          <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Photo Attached
          </span>
        )}
      </div>

      {description && <p className="text-xs text-slate-500">{description}</p>}

      {photoUrl ? (
        <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 group shadow-2xs">
          <img
            src={photoUrl}
            alt={label}
            className="w-full h-44 object-cover object-center rounded-xl transition-transform group-hover:scale-[1.01]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
            <span className="text-[13px] font-medium text-white flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-white" />
              Attached Photo
            </span>
            <button
              type="button"
              onClick={() => onPhotoChange(undefined)}
              className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer shadow-md transition-colors"
              title="Remove photo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-orange-500 rounded-xl p-5 text-center bg-slate-50 hover:bg-orange-50/20 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="w-10 h-10 rounded-full bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-800">
              Click to upload photo or drag & drop
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              PNG, JPG, WebP supported
            </div>
          </div>
          {/* A sample picture would let a job start or close without a real site photo — demo only */}
          {DEMO_MODE && samplePhotoFallback && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPhotoChange(samplePhotoFallback);
              }}
              className="mt-1 h-7 text-xs"
            >
              Use Sample Field Photo
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
