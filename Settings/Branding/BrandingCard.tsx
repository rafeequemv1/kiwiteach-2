
import '../../types';
import React, { useRef, useState } from 'react';
import { BrandingConfig } from '../../Quiz/types';
import { supabase } from '../../supabase/client';

interface BrandingCardProps {
  config: BrandingConfig;
  onUpdate: (config: BrandingConfig) => void;
  /** Hide card chrome when nested in Settings split layout */
  embedded?: boolean;
}

const Toggle: React.FC<{ label: string; sub: string; checked: boolean; onChange: () => void }> = ({ label, sub, checked, onChange }) => (
  <label className="group flex cursor-pointer items-center justify-between gap-3 rounded-md border border-zinc-100 bg-zinc-50/50 px-3 py-2.5">
    <div className="min-w-0 flex-1">
      <span className="block text-[13px] font-medium text-zinc-800">{label}</span>
      <span className="text-[11px] text-zinc-500">{sub}</span>
    </div>
    <div className="relative shrink-0">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`block h-5 w-10 rounded-full transition-colors ${checked ? 'bg-zinc-900' : 'bg-zinc-300'}`} />
      <div className={`dot absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </div>
  </label>
);

const BrandingCard: React.FC<BrandingCardProps> = ({ config, onUpdate, embedded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ ...config, name: e.target.value });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in to upload a logo.");

      // Sanitize filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_logo.${fileExt}`;
      const filePath = `logos/${user.id}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('branding-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('branding-assets')
        .getPublicUrl(filePath);

      // Update config with new URL
      onUpdate({ ...config, logo: publicUrl });

    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLogo = () => {
    onUpdate({ ...config, logo: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleShowOnTest = () => onUpdate({ ...config, showOnTest: !config.showOnTest });
  const toggleShowOnOmr = () => onUpdate({ ...config, showOnOmr: !config.showOnOmr });

  return (
    <div
      className={
        embedded
          ? ''
          : 'rounded-md border border-zinc-200 bg-white p-5 shadow-sm md:p-6'
      }
    >
      {!embedded && (
        <div className="mb-5 flex items-center gap-3 border-b border-zinc-100 pb-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-zinc-700">
            <iconify-icon icon="mdi:palette-outline" width="20"></iconify-icon>
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">Branding</h3>
            <p className="text-[12px] text-zinc-500">Identity &amp; display</p>
          </div>
        </div>
      )}

      <div className={embedded ? 'space-y-6' : 'space-y-8'}>
        {/* Brand Name Input */}
        <div>
          <label className="mb-2 ml-0.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Brand name</label>
          <div className="group relative">
            <input
              type="text"
              value={config.name}
              onChange={handleNameChange}
              placeholder="Workspace name"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:border-zinc-400 focus:bg-white"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-zinc-500">
              <iconify-icon icon="mdi:rename-outline" width="20"></iconify-icon>
            </div>
          </div>
        </div>

        {/* Logo Upload Section */}
        <div>
          <label className="mb-2 ml-0.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Logo</label>
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <div className="relative">
              <div className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-dashed border-zinc-200 bg-zinc-50 transition-colors hover:border-zinc-300">
                {isUploading ? (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700"></div>
                  </div>
                ) : config.logo ? (
                  <img src={config.logo} alt="Brand Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <iconify-icon icon="mdi:image-plus" width="28" className="text-zinc-300 group-hover:text-zinc-500"></iconify-icon>
                )}
                
                {!isUploading && (
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLogoUpload}
                    accept="image/png, image/jpeg, image/svg+xml"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                )}
              </div>
              
              {!isUploading && config.logo && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="absolute -top-2 -right-2 z-20 rounded-full border border-red-100 bg-white p-1 text-red-500 shadow-md transition-colors hover:bg-red-50"
                >
                  <iconify-icon icon="mdi:close-circle" width="20"></iconify-icon>
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[13px] font-medium text-zinc-700">Organization logo</p>
              <p className="max-w-sm text-[11px] leading-relaxed text-zinc-500">
                PNG, JPG, or SVG. ~512×512 recommended.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="mt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Choose File'}
              </button>
            </div>
          </div>
        </div>

        {/* Preferences / Toggles */}
        <div className="border-t border-zinc-100 pt-5">
          <label className="mb-3 ml-0.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">On exports</label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-8">
            <Toggle 
              label="Add to Test Paper" 
              sub="Show brand name/logo on the generated PDF test header." 
              checked={config.showOnTest} 
              onChange={toggleShowOnTest} 
            />
            <Toggle 
              label="Add to OMR Sheet" 
              sub="Show branding elements on the OMR answer sheets." 
              checked={config.showOnOmr} 
              onChange={toggleShowOnOmr} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandingCard;
