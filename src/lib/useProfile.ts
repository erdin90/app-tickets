'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type Profile = {
  full_name: string | null;
  role: 'admin' | 'manager' | 'it' | 'client';
  locale: string | null;
  timezone: string | null;
};

export function useProfile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { user }, error: uerr } = await supabase.auth.getUser();
    if (uerr) { setError(uerr.message); setLoading(false); return; }
    if (!user) { setUserId(null); setProfile(null); setLoading(false); return; }

    setUserId(user.id);
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role, locale, timezone')
      .eq('id', user.id)
      .single();

    if (error) setError(error.message);
    else setProfile(data as Profile);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { userId, profile, loading, error, reload: load };
}
