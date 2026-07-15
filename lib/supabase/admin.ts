import {createClient} from '@supabase/supabase-js';
export function createAdminClient(){if(!process.env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY missing');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
