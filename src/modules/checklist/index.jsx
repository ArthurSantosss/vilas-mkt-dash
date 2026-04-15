import { useState } from 'react';
import { useChecklist } from '../../contexts/ChecklistContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatTime } from '../../shared/utils/format';
import { CheckSquare, Plus, Trash2, PartyPopper, Building2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

export default function Checklist() {
  const { tasksByAgency, addTask, toggleTask, deleteTask, clearAllTasks, completedCount, totalCount, progress, loading } = useChecklist();
  const { agencies } = useAgency();

  const [newTask, setNewTask] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleAddTask = () => {
    if (newTask.trim()) {
      addTask(newTask.trim(), selectedAgency);
      setNewTask('');
    }
  };

  const toggleGroup = (name) => {
    setExpandedGroups(prev => ({ ...prev, [name]: prev[name] === false ? true : prev[name] === undefined ? false : !prev[name] }));
  };

  const isGroupExpanded = (name) => expandedGroups[name] !== false; // default expanded

  const isComplete = progress === 100 && totalCount > 0;
  const agencyGroups = Object.keys(tasksByAgency);

  // Sort: "Geral" first, then alphabetically
  const sortedGroups = agencyGroups.sort((a, b) => {
    if (a === 'Geral') return -1;
    if (b === 'Geral') return 1;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success/10">
            <CheckSquare size={24} className="text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Checklist</h1>
            <p className="text-sm text-text-secondary">Carregando tarefas...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="section-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-success to-emerald-400 shadow-lg shadow-success/20">
            <CheckSquare size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Checklist</h1>
            <p className="text-xs lg:text-sm text-text-secondary">Tarefas personalizadas por agência</p>
          </div>
        </div>
        {totalCount > 0 && (
          <button
            onClick={clearAllTasks}
            className="relative flex w-full items-center justify-center gap-2 px-3.5 py-2 bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl text-xs font-medium text-text-secondary hover:text-danger hover:border-danger/30 transition-all sm:w-auto"
          >
            <RotateCcw size={13} /> Limpar Tudo
          </button>
        )}
      </div>

      {/* Progress */}
      {totalCount > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">{completedCount} de {totalCount} concluídas</span>
            <span className="text-sm font-bold text-primary-light">{progress.toFixed(0)}%</span>
          </div>
          <div className="h-3 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {isComplete && (
            <div className="mt-4 flex items-center gap-2 text-success text-sm font-medium animate-bounce">
              <PartyPopper size={18} /> Todas as tarefas concluídas! Excelente trabalho!
            </div>
          )}
        </div>
      )}

      {/* Add task */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Nova tarefa..."
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTask()}
            className="flex-1 bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
          />
          <select
            value={selectedAgency}
            onChange={e => setSelectedAgency(e.target.value)}
            className="w-full sm:w-auto bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="">Geral</option>
            {agencies.map(ag => (
              <option key={ag} value={ag}>{ag}</option>
            ))}
          </select>
          <button
            onClick={handleAddTask}
            disabled={!newTask.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-light text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>
      </div>

      {/* Tasks by agency */}
      {totalCount === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <CheckSquare size={48} className="text-text-secondary mx-auto mb-4 opacity-30" />
          <p className="text-text-secondary text-sm">Nenhuma tarefa ainda. Adicione sua primeira tarefa acima.</p>
          <p className="text-text-secondary/60 text-xs mt-1">Dica: selecione uma agência para organizar suas tarefas por grupo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedGroups.map(groupName => {
            const groupTasks = tasksByAgency[groupName];
            const groupCompleted = groupTasks.filter(t => t.completed).length;
            const expanded = isGroupExpanded(groupName);

            return (
              <div key={groupName} className="bg-surface rounded-xl border border-border overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expanded
                      ? <ChevronDown size={14} className="text-text-secondary" />
                      : <ChevronRight size={14} className="text-text-secondary" />
                    }
                    <Building2 size={14} className="text-primary-light" />
                    <span className="text-sm font-semibold text-text-primary">{groupName}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                      {groupCompleted}/{groupTasks.length}
                    </span>
                  </div>
                  {groupCompleted === groupTasks.length && groupTasks.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                      Completo ✓
                    </span>
                  )}
                </button>

                {/* Tasks list */}
                {expanded && (
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    {groupTasks.map(task => (
                      <div
                        key={task.id}
                        className="group flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-hover/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task.id)}
                          className="w-4 h-4 rounded border-border accent-primary shrink-0 cursor-pointer"
                        />
                        <span className={`min-w-0 flex-1 text-sm ${task.completed ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                          {task.text}
                        </span>
                        {task.completedAt && (
                          <span className="text-xs text-text-secondary">{formatTime(task.completedAt)}</span>
                        )}
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-text-secondary/30 hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                          title="Remover tarefa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
