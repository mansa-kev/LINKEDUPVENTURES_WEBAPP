import { createClient } from '@supabase/supabase-js';
import { handleSupabaseError } from '../utils/errorHandling';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const handleSupabaseErrorWrapper = (error: any, operation: string) => {
  throw new Error(handleSupabaseError(error, operation));
};
