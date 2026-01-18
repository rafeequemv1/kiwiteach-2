
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vxryarparkhmhzrqdskm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4cnlhcnBhcmtobWh6cnFkc2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2ODA3MTgsImV4cCI6MjA4MjI1NjcxOH0.c9hKp97rff6ypQN0XpHGPwkr1M6AcnDsMR9X9Z51hWs';

// Standard client creation. 
// If 'Failed to fetch' persists, check project status in Supabase Dashboard.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
