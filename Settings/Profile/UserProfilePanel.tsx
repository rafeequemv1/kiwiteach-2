import '../../types';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase/client';

type ProfileRow = {
  role: string | null;
  full_name: string | null;
  avatar_url: string | null;
  class_id: string | null;
  business_id: string | null;
  organization_id: string | null;
};

interface UserProfilePanelProps {
  userId: string;
  embedded?: boolean;
}

const pretty = (v: unknown) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' && !v.trim()) return '—';
  return String(v);
};

const UserProfilePanel: React.FC<UserProfilePanelProps> = ({ userId, embedded }) => {
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!mounted) return;
        setEmail(authData.user?.email ?? null);

        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('role, full_name, avatar_url, class_id, business_id, organization_id')
          .eq('id', userId)
          .maybeSingle();
        if (profErr) throw profErr;
        if (!mounted) return;
        setProfile((prof || null) as ProfileRow | null);
      } catch (e: any) {
        if (!mounted) return;
        alert(e?.message || 'Failed to load profile');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const items = useMemo(() => {
    return [
      { label: 'User ID', value: userId },
      { label: 'Email', value: email },
      { label: 'Role', value: profile?.role || null },
      { label: 'Full name', value: profile?.full_name || null },
      { label: 'Avatar URL', value: profile?.avatar_url || null },
      { label: 'Organization ID', value: profile?.organization_id || null },
      { label: 'Business ID', value: profile?.business_id || null },
      { label: 'Class ID', value: profile?.class_id || null },
    ];
  }, [userId, email, profile]);

  const shell = embedded ? '' : 'rounded-md border border-zinc-200 bg-white p-5 shadow-sm md:p-6';

  return (
    <div className={shell}>
      {!embedded && (
        <div className="mb-5 flex items-center gap-3 border-b border-zinc-100 pb-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-zinc-700">
            <iconify-icon icon="mdi:account-circle-outline" width="20"></iconify-icon>
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">Profile</h3>
            <p className="text-[12px] text-zinc-500">Your account details</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.label} className="rounded-lg border border-zinc-200 bg-zinc-50/30 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{it.label}</p>
              <p className="mt-1 break-all text-sm font-medium text-zinc-800">{pretty(it.value)}</p>
            </div>
          ))}

          <div className="md:col-span-2 rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Avatar preview</p>
            <div className="mt-3 flex items-center gap-4">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="h-12 w-12 rounded-full border border-zinc-200 bg-zinc-50 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400">
                  <iconify-icon icon="mdi:image-off-outline" width="20" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800">
                  {profile?.full_name || email || '—'}
                </p>
                <p className="text-[12px] text-zinc-500">Role: {profile?.role || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfilePanel;

