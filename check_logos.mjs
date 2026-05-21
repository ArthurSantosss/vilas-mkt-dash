import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('Faltam credenciais .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  console.log('Conectando ao Supabase:', url);
  
  // 1. Tentar buscar de client_logos
  const { data: logos, error: errorLogos } = await supabase.from('client_logos').select('*');
  if (errorLogos) {
    console.error('ERRO EM client_logos:', errorLogos.message);
  } else {
    console.log('CONTEÚDO DE client_logos:', logos);
  }
}

check();
