import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carrega as variáveis do .env do projeto
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('Faltam credenciais .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('app_preferences').select('*');
  if (error) {
    console.error('ERRO AO BUSCAR TABELA (Provavelmente ela nao foi criada):', error.message);
  } else {
    console.log('SUCESSO! TABELA EXISTE. Linhas encontradas:', data?.length);
    console.log(data);
  }
}
test();
