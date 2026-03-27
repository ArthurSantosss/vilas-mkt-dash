import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

const ChangeLogContext = createContext();

function toFrontend(row) {
  return {
    id: row.id,
    date: row.date,
    platform: row.platform,
    clientName: row.client_name,
    accountId: row.account_id,
    campaignName: row.campaign_name,
    changeType: row.change_type,
    description: row.description,
    previousValue: row.previous_value,
    newValue: row.new_value,
    impact: row.impact,
  };
}

function toDatabase(data) {
  return {
    platform: data.platform,
    client_name: data.clientName,
    account_id: data.accountId || null,
    campaign_name: data.campaignName || null,
    change_type: data.changeType,
    description: data.description,
    previous_value: data.previousValue || null,
    new_value: data.newValue || null,
    impact: data.impact || 'pending',
  };
}

export function ChangeLogProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('change_log')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Erro ao buscar log:', error);
    } else {
      setEntries(data.map(toFrontend));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addEntry = async (entry) => {
    const { data, error } = await supabase
      .from('change_log')
      .insert(toDatabase(entry))
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar entrada:', error);
      throw error;
    }

    setEntries(prev => [toFrontend(data), ...prev]);
  };

  const updateImpact = async (id, impact) => {
    const { error } = await supabase
      .from('change_log')
      .update({ impact })
      .eq('id', id);

    if (error) {
      console.error('Erro ao atualizar impacto:', error);
      throw error;
    }

    setEntries(prev => prev.map(e => e.id === id ? { ...e, impact } : e));
  };

  const value = { entries, loading, addEntry, updateImpact, refetch: fetchEntries };
  return <ChangeLogContext.Provider value={value}>{children}</ChangeLogContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChangeLog() {
  const ctx = useContext(ChangeLogContext);
  if (!ctx) throw new Error('useChangeLog must be used within ChangeLogProvider');
  return ctx;
}
