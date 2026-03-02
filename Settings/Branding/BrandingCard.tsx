
import '../../types';
import React, { useRef, useState } from 'react';
import { BrandingConfig } from '../../Quiz/types';
import { supabase } from '../../supabase/client';

interface BrandingCardProps {
  config: BrandingConfig;
  onUpdate: (config: BrandingConfig) => void;
}

const Toggle: React.FC<{ label: string; sub: string; checked: boolean; onChange: () => void }> = ({ label, sub, checked, onChange }) => (
  <label className="flex items-center justify-between cursor-pointer group py-2">
    <div className="flex-1">
      <span className="text-sm font-bold text-slate-700 block">{label}</span>
      <span className="text-[10px] text-slate-400 font-medium">{sub}</span>
    </div>
    <div className="relative">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`block bg-slate-200 w-10 h-5 rounded-full transition-colors ${checked ? 'bg-accent' : ''}`}></div>
      <div className={`dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${checked ? 'transform translate-x-5' : ''}`}></div>
    </div>
  </label>
);

const BrandingCard: React.FC<BrandingCardProps> = ({ config, onUpdate }) => {
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
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-indigo-50 rounded-2xl text-accent">
          <iconify-icon icon="mdi:palette-outline" width="24"></iconify-icon>
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Branding</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customize your workspace identity</p>
        </div>
      </div>

      <div className="space-y-10">
        {/* Brand Name Input */}
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Brand Name</label>
          <div className="relative group">
            <input
              type="text"
              value={config.name}
              onChange={handleNameChange}
              placeholder="Enter your brand name"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-accent focus:bg-white font-bold text-sm transition-all"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-accent transition-colors">
              <iconify-icon icon="mdi:rename-outline" width="20"></iconify-icon>
            </div>
          </div>
        </div>

        {/* Logo Upload Section */}
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Identity Logo</label>
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="relative">
              <div className="w-32 h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group hover:border-accent transition-colors relative">
                {isUploading ? (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                    <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  </div>
                ) : config.logo ? (
                  <img src={config.logo} alt="Brand Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <iconify-icon icon="mdi:image-plus" width="32" className="text-slate-300 group-hover:text-accent transition-colors"></iconify-icon>
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
                  onClick={removeLogo}
                  className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full p-1 shadow-lg border border-red-50 hover:bg-red-50 transition-colors z-20"
                >
                  <iconify-icon icon="mdi:close-circle" width="20"></iconify-icon>
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm font-bold text-slate-600">Upload your organization logo</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                Recommended size: 512x512px. Supported formats: PNG, JPG, or SVG. Stored securely in cloud bucket.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="mt-2 text-accent text-xs font-black uppercase tracking-widest hover:underline disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Choose File'}
              </button>
            </div>
          </div>
        </div>

        {/* Preferences / Toggles */}
        <div className="pt-6 border-t border-slate-50">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Display Preferences</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
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
