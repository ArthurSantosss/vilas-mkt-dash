import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

const ClientsContext = createContext();

// Converte snake_case do Supabase para camelCase do frontend
function toFrontend(row) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    niche: row.niche,
    platforms: row.platforms || ['meta'],
    metaAccountId: row.meta_account_id,
    monthlyBudget: parseFloat(row.monthly_budget) || 0,
    contractStartDate: row.contract_start_date,
    paymentDueDay: row.payment_due_day,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Converte camelCase do frontend para snake_case do Supabase
function toDatabase(data) {
  const map = {};
  if (data.name !== undefined) map.name = data.name;
  if (data.contactName !== undefined) map.contact_name = data.contactName;
  if (data.phone !== undefined) map.phone = data.phone;
  if (data.email !== undefined) map.email = data.email;
  if (data.niche !== undefined) map.niche = data.niche;
  if (data.platforms !== undefined) map.platforms = data.platforms;
  if (data.metaAccountId !== undefined) map.meta_account_id = data.metaAccountId;
  if (data.monthlyBudget !== undefined) map.monthly_budget = data.monthlyBudget;
  if (data.contractStartDate !== undefined) map.contract_start_date = data.contractStartDate;
  if (data.paymentDueDay !== undefined) map.payment_due_day = data.paymentDueDay;
  if (data.status !== undefined) map.status = data.status;
  if (data.notes !== undefined) map.notes = data.notes;
  return map;
}

export function ClientsProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      console.error('Erro ao buscar clientes:', err);
      setError(err.message);
    } else {
      setClients(data.map(toFrontend));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const addClient = async (clientData) => {
    const { data, error: err } = await supabase
      .from('clients')
      .insert(toDatabase(clientData))
      .select()
      .single();

    if (err) {
      console.error('Erro ao criar cliente:', err);
      throw err;
    }

    setClients(prev => [toFrontend(data), ...prev]);
    return toFrontend(data);
  };

  const updateClient = async (id, updates) => {
    const { data, error: err } = await supabase
      .from('clients')
      .update(toDatabase(updates))
      .eq('id', id)
      .select()
      .single();

    if (err) {
      console.error('Erro ao atualizar cliente:', err);
      throw err;
    }

    setClients(prev => prev.map(c => c.id === id ? toFrontend(data) : c));
    return toFrontend(data);
  };

  const deleteClient = async (id) => {
    const { error: err } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (err) {
      console.error('Erro ao deletar cliente:', err);
      throw err;
    }

    setClients(prev => prev.filter(c => c.id !== id));
  };

  const value = { clients, loading, error, addClient, updateClient, deleteClient, refetch: fetchClients };
  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) throw new Error('useClients must be used within ClientsProvider');
  return ctx;
}
