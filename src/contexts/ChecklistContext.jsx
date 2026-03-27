import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

const ChecklistContext = createContext();

function toFrontend(row) {
  return {
    id: row.id,
    text: row.text,
    agency: row.agency || '',
    completed: row.completed,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function ChecklistProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useSupabase, setUseSupabase] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  // ── Load tasks ──
  const fetchTasks = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_date', today)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setTasks((data || []).map(toFrontend));
      setUseSupabase(true);
    } catch (err) {
      console.warn('[Checklist] Supabase indisponível, usando localStorage:', err.message);
      setUseSupabase(false);
      // Fallback: localStorage
      try {
        const stored = JSON.parse(localStorage.getItem(`checklist_${today}`)) || [];
        setTasks(stored);
      } catch {
        setTasks([]);
      }
    }

    setLoading(false);
  }, [today]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Persist to localStorage as fallback ──
  const persistLocal = useCallback((newTasks) => {
    localStorage.setItem(`checklist_${today}`, JSON.stringify(newTasks));
  }, [today]);

  // ── Add task ──
  const addTask = useCallback(async (text, agency = '') => {
    if (!text.trim()) return;

    if (useSupabase) {
      try {
        const { data, error } = await supabase
          .from('checklist_items')
          .insert({
            text: text.trim(),
            agency,
            is_default: false,
            completed: false,
            checklist_date: today,
          })
          .select()
          .single();

        if (error) throw error;
        setTasks(prev => [...prev, toFrontend(data)]);
        return;
      } catch (err) {
        console.warn('[Checklist] Erro Supabase ao adicionar, fallback localStorage:', err.message);
      }
    }

    // Fallback: localStorage
    const newTask = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: text.trim(),
      agency,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => {
      const updated = [...prev, newTask];
      persistLocal(updated);
      return updated;
    });
  }, [useSupabase, today, persistLocal]);

  // ── Toggle task ──
  const toggleTask = useCallback(async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    const newCompletedAt = newCompleted ? new Date().toISOString() : null;

    if (useSupabase && !String(id).startsWith('local_')) {
      try {
        const { error } = await supabase
          .from('checklist_items')
          .update({ completed: newCompleted, completed_at: newCompletedAt })
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('[Checklist] Erro ao atualizar no Supabase:', err.message);
      }
    }

    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === id ? { ...t, completed: newCompleted, completedAt: newCompletedAt } : t
      );
      if (!useSupabase) persistLocal(updated);
      return updated;
    });
  }, [tasks, useSupabase, persistLocal]);

  // ── Delete task ──
  const deleteTask = useCallback(async (id) => {
    if (useSupabase && !String(id).startsWith('local_')) {
      try {
        const { error } = await supabase
          .from('checklist_items')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('[Checklist] Erro ao deletar no Supabase:', err.message);
      }
    }

    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id);
      if (!useSupabase) persistLocal(updated);
      return updated;
    });
  }, [useSupabase, persistLocal]);

  // ── Clear all tasks for today ──
  const clearAllTasks = useCallback(async () => {
    if (useSupabase) {
      try {
        await supabase
          .from('checklist_items')
          .delete()
          .eq('checklist_date', today);
      } catch (err) {
        console.warn('[Checklist] Erro ao limpar no Supabase:', err.message);
      }
    }

    setTasks([]);
    persistLocal([]);
  }, [useSupabase, today, persistLocal]);

  // ── Computed values ──
  const tasksByAgency = useMemo(() => {
    const groups = {};
    // Group "" (no agency) as "Geral"
    tasks.forEach(t => {
      const key = t.agency || 'Geral';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [tasks]);

  const completedCount = useMemo(() => tasks.filter(t => t.completed).length, [tasks]);
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const value = {
    tasks,
    tasksByAgency,
    addTask,
    toggleTask,
    deleteTask,
    clearAllTasks,
    completedCount,
    totalCount,
    progress,
    loading,
  };

  return <ChecklistContext.Provider value={value}>{children}</ChecklistContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChecklist() {
  const ctx = useContext(ChecklistContext);
  if (!ctx) throw new Error('useChecklist must be used within ChecklistProvider');
  return ctx;
}
