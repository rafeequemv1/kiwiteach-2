import { supabase } from './client';

/** Profile business membership for shared org visibility (institutes / classes). */
export async function fetchProfileBusinessId(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('business_id').eq('id', userId).maybeSingle();
  if (error && (/42703|business_id/i.test(`${error.code || ''} ${error.message || ''}`))) {
    return null;
  }
  const bid = data?.business_id;
  return typeof bid === 'string' ? bid : null;
}

/** Institutes owned by the user or under the same business as their profile. */
export async function fetchInstitutesForUser(userId: string) {
  const bid = await fetchProfileBusinessId(userId);
  let q = supabase.from('institutes').select('id, name, business_id').order('name');
  if (bid) {
    q = q.or(`user_id.eq.${userId},business_id.eq.${bid}`);
  } else {
    q = q.eq('user_id', userId);
  }
  const { data, error } = await q;
  return { data: data ?? [], error, businessId: bid };
}

/** Classes created by the user or belonging to visible institutes. */
export async function fetchClassesForUser(userId: string, instituteIds: string[]) {
  const parts = [`user_id.eq.${userId}`];
  if (instituteIds.length) {
    parts.push(`institute_id.in.(${instituteIds.join(',')})`);
  }
  return await supabase.from('classes').select('id, name, institute_id').or(parts.join(',')).order('name');
}

/** Businesses the user created or is assigned to via profile.business_id. */
export async function fetchBusinessesForUser(userId: string) {
  const bid = await fetchProfileBusinessId(userId);
  let q = supabase.from('businesses').select('id, name, details, subscription_tier_id').order('name');
  if (bid) {
    q = q.or(`user_id.eq.${userId},id.eq.${bid}`);
  } else {
    q = q.eq('user_id', userId);
  }
  return await q;
}
