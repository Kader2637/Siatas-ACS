import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://frxohpimzcxqwgaaxjkt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyeG9ocGltemN4cXdnYWF4amt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyOTgyODUsImV4cCI6MjA4ODg3NDI4NX0.g-XctjnCRELr-gWRawiMSzCGqMg7kyaCmhnr_St1vEw';


// Logika storage universal tanpa sintaks TypeScript
const supabaseStorage = Platform.OS === 'web' 
  ? (typeof window !== 'undefined' ? window.localStorage : undefined) 
  : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: supabaseStorage, // "as any" dihapus biar gak error di .js
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});