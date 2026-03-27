import { useState, useMemo, useEffect } from 'react';
// Google Calendar token is managed via localStorage (Settings page)
import { calendarEventsData } from '../../data/mockData';
import { formatTime } from '../../shared/utils/format';
import { Calendar, ChevronLeft, ChevronRight, X, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

const viewModes = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

const typeColors = {
  client_meeting: 'bg-info/20 border-info/40 text-info',
  internal: 'bg-success/20 border-success/40 text-success',
  focus_block: 'bg-text-secondary/10 border-text-secondary/30 text-text-secondary',
};
const typeLabels = {
  client_meeting: 'Reunião com Cliente',
  internal: 'Tarefa Interna',
  focus_block: 'Bloco de Foco',
};

function getWeekDays(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-based
  const days = [];
  for (let i = -startOffset; i <= lastDay.getDate() + (6 - ((lastDay.getDay() + 6) % 7)) - 1; i++) {
    const d = new Date(year, month, i + 1);
    days.push(d);
  }
  return days;
}

export default function Agenda() {
  const [viewMode, setViewMode] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [googleEvents, setGoogleEvents] = useState(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState(null);
  const [googleToken, setGoogleToken] = useState(() => localStorage.getItem('google_calendar_token'));

  // Define os eventos a serem exibidos: do Google (se autenticado), senão os mocks
  const events = googleEvents || calendarEventsData;

  const fetchGoogleCalendarEvents = async (token) => {
    try {
      setLoadingGoogle(true);
      setGoogleError(null);

      // Buscar eventos a partir de 1 mês antes até 2 meses depois da data atual
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 1);
      const timeMax = new Date();
      timeMax.setMonth(timeMax.getMonth() + 2);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.status === 401) {
        // Token expirado ou inválido
        localStorage.removeItem('google_calendar_token');
        setGoogleToken(null);
        throw new Error('Sessão do Google expirou. Conecte novamente.');
      }

      if (!response.ok) {
        throw new Error('Falha ao buscar eventos do Google Calendar.');
      }

      const data = await response.json();

      // Mapear eventos do Google para o formato do sistema
      const mappedEvents = (data.items || []).map(item => {
        let startTime = item.start.dateTime || item.start.date;
        let endTime = item.end.dateTime || item.end.date;

        // Tentar inferir o tipo do evento pelo título
        let type = 'internal';
        if (item.summary?.toLowerCase().includes('reunião') || item.summary?.toLowerCase().includes('call') || item.summary?.toLowerCase().includes('cliente')) {
          type = 'client_meeting';
        } else if (item.summary?.toLowerCase().includes('foco') || item.summary?.toLowerCase().includes('block')) {
          type = 'focus_block';
        }

        return {
          id: item.id,
          title: item.summary || 'Sem título',
          start: startTime,
          end: endTime,
          type: type,
          client: '', // Google Calendar não tem um campo cliente nativo, teríamos que extrair da descrição ou convites
          notes: item.description,
          meetingLink: item.hangoutLink || (item.location?.startsWith('http') ? item.location : null),
        };
      });

      setGoogleEvents(mappedEvents);
    } catch (err) {
      console.error(err);
      setGoogleError(err.message);
    } finally {
      setLoadingGoogle(false);
    }
  };

  useEffect(() => {
    if (googleToken) {
      fetchGoogleCalendarEvents(googleToken);
    }
  }, [googleToken]);

  const loginGoogle = () => {
    const token = window.prompt('Cole o token de acesso do Google Calendar:');
    if (token && token.trim()) {
      localStorage.setItem('google_calendar_token', token.trim());
      setGoogleToken(token.trim());
    }
  };

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate]);

  const getEventsForDate = (date) => {
    // Formata a data para comparar com a string de start do evento
    const dateStr = date.toLocaleDateString('en-CA'); // Formato YYYY-MM-DD local
    return events.filter(e => {
      // e.start pode ser um datetime ISO ('2026-03-09T10:00:00-03:00') ou somente data ('2026-03-09')
      return e.start.startsWith(dateStr);
    }).sort((a, b) => a.start.localeCompare(b.start));
  };

  const headerText = viewMode === 'month'
    ? currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : viewMode === 'week'
      ? `${weekDays[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${weekDays[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const todayStr = new Date().toLocaleDateString('en-CA');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-info/10"><Calendar size={24} className="text-info" /></div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Agenda</h1>
            <p className="text-sm text-text-secondary">Compromissos e reuniões {googleToken ? '(Google Calendar sincronizado)' : '(Dados de demonstração)'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">

          {!googleToken ? (
            <button
              onClick={() => loginGoogle()}
              className="px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-black font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              Conectar Google Agenda
            </button>
          ) : (
            <button
              onClick={() => fetchGoogleCalendarEvents(googleToken)}
              className="p-2 text-text-secondary hover:text-primary transition-colors bg-surface border border-border rounded-lg"
              title="Sincronizar"
              disabled={loadingGoogle}
            >
              <RefreshCw size={18} className={loadingGoogle ? 'animate-spin' : ''} />
            </button>
          )}

          <div className="flex gap-1 items-center bg-surface border border-border rounded-lg p-0.5 ml-2">
            <button onClick={goToToday} className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-all">Hoje</button>
            <div className="w-px h-4 bg-border mx-1"></div>
            <button onClick={() => navigate(-1)} className="p-1.5 text-text-secondary hover:text-text-primary"><ChevronLeft size={16} /></button>
            <button onClick={() => navigate(1)} className="p-1.5 text-text-secondary hover:text-text-primary"><ChevronRight size={16} /></button>
          </div>

          <span className="text-sm font-medium text-text-primary capitalize min-w-40 text-center">{headerText}</span>

          <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
            {viewModes.map(m => (
              <button key={m.value} onClick={() => setViewMode(m.value)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${viewMode === m.value ? 'bg-gradient-to-r from-primary to-primary-light text-black' : 'text-text-secondary hover:text-text-primary'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {googleError && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{googleError}</span>
          </div>
          <button onClick={() => setGoogleError(null)}><X size={16} /></button>
        </div>
      )}

      {/* Week view */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map(day => {
            const dayStr = day.toLocaleDateString('en-CA');
            const dayEvents = getEventsForDate(day);
            const isToday = dayStr === todayStr;
            return (
              <div key={dayStr} className={`bg-surface rounded-xl border ${isToday ? 'border-primary/40' : 'border-border'} p-3 min-h-[500px]`}>
                <div className={`text-center mb-3 pb-2 border-b ${isToday ? 'border-primary/30' : 'border-border/50'}`}>
                  <p className="text-xs text-text-secondary">{day.toLocaleDateString('pt-BR', { weekday: 'short' })}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-primary-light' : 'text-text-primary'}`}>{day.getDate()}</p>
                </div>

                {loadingGoogle && isToday && (
                  <p className="text-xs text-text-secondary text-center py-4 animate-pulse">Sincronizando...</p>
                )}

                <div className="space-y-2">
                  {dayEvents.map(event => (
                    <button key={event.id} onClick={() => setSelectedEvent(event)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all hover:opacity-80 hover:-translate-y-0.5 ${typeColors[event.type]}`}>
                      <p className="font-bold mb-0.5 tracking-wide">{formatTime(event.start)}</p>
                      <p className="font-medium line-clamp-2 leading-tight">{event.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Day view */}
      {viewMode === 'day' && (
        <div className="bg-surface rounded-xl border border-border p-5 min-h-[500px]">
          <div className="space-y-3">
            {loadingGoogle && (
              <p className="text-sm text-text-secondary text-center py-8 animate-pulse">Sincronizando com Google Calendar...</p>
            )}
            {!loadingGoogle && getEventsForDate(currentDate).length === 0 && (
              <p className="text-text-secondary text-sm text-center py-8">Nenhum evento neste dia.</p>
            )}
            {!loadingGoogle && getEventsForDate(currentDate).map(event => (
              <button key={event.id} onClick={() => setSelectedEvent(event)}
                className={`w-full flex flex-col md:flex-row md:items-center justify-between text-left p-4 rounded-lg border transition-all hover:opacity-80 gap-4 ${typeColors[event.type]}`}>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono font-bold whitespace-nowrap bg-black/10 px-2 py-1 rounded">{formatTime(event.start)} — {formatTime(event.end)}</span>
                  <span className="text-base font-semibold">{event.title}</span>
                </div>
                {event.client && <span className="text-sm font-medium opacity-80 px-3 py-1 bg-black/10 rounded-full">{event.client}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Month view */}
      {viewMode === 'month' && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-7 bg-bg/30">
            {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map(d => (
              <div key={d} className="text-center text-xs text-text-secondary font-bold py-3 border-b border-border uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 relative">
            {loadingGoogle && (
              <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                <span className="bg-surface border border-border px-4 py-2 rounded-lg text-sm font-medium shadow-xl animate-pulse">Sincronizando...</span>
              </div>
            )}
            {monthDays.map((day, i) => {
              const dayStr = day.toLocaleDateString('en-CA');
              const dayEvents = getEventsForDate(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = dayStr === todayStr;
              return (
                <div key={i} className={`min-h-32 p-2 border-b border-r border-border/50 transition-colors hover:bg-surface-hover ${!isCurrentMonth ? 'bg-bg/20 opacity-40' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <p className={`text-sm font-medium flex items-center justify-center w-7 h-7 rounded-full ${isToday ? 'bg-primary text-black' : 'text-text-secondary'}`}>
                      {day.getDate()}
                    </p>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-text-secondary bg-bg px-1.5 rounded">{dayEvents.length}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => (
                      <button key={event.id} onClick={() => setSelectedEvent(event)}
                        className={`w-full text-left px-1.5 py-1 rounded text-[11px] font-medium truncate border transition-opacity hover:opacity-80 ${typeColors[event.type]}`}>
                        <span className="mr-1 opacity-70">{formatTime(event.start)}</span>
                        {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] font-medium text-text-secondary text-center pt-1 hover:text-text-primary cursor-pointer transition-colors"
                        onClick={() => { setViewMode('day'); setCurrentDate(day); }}>
                        Ver todos os {dayEvents.length} eventos
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSelectedEvent(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-surface rounded-2xl border border-border w-[480px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`h-1.5 w-full ${typeColors[selectedEvent.type].split(' ')[0].replace('/20', '')}`}></div>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className={`inline-block text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border mb-3 ${typeColors[selectedEvent.type]}`}>{typeLabels[selectedEvent.type]}</span>
                  <h2 className="text-xl font-bold text-text-primary leading-tight">{selectedEvent.title}</h2>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="text-text-secondary hover:text-danger bg-bg/50 hover:bg-danger/10 p-1.5 rounded-lg transition-colors"><X size={20} /></button>
              </div>

              <div className="space-y-4 text-sm bg-bg/30 p-4 rounded-xl border border-border/50 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Horário</span>
                  <span className="text-text-primary font-bold bg-surface px-2 py-1 rounded border border-border">{formatTime(selectedEvent.start)} — {formatTime(selectedEvent.end)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-medium">Data</span>
                  <span className="text-text-primary">{new Date(selectedEvent.start).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
                {selectedEvent.client && (
                  <div className="flex justify-between items-center pt-4 border-t border-border/50">
                    <span className="text-text-secondary font-medium">Cliente Relacionado</span>
                    <span className="text-text-primary font-bold">{selectedEvent.client}</span>
                  </div>
                )}
              </div>

              {selectedEvent.notes && (
                <div className="mb-6">
                  <span className="text-xs uppercase tracking-wider font-bold text-text-secondary block mb-2">Descrição / Notas</span>
                  <div className="text-text-primary bg-surface p-4 rounded-xl border border-border text-sm leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: selectedEvent.notes }}></div>
                </div>
              )}

              {selectedEvent.meetingLink ? (
                <a href={selectedEvent.meetingLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-primary to-primary-light text-black rounded-xl text-sm font-bold hover:shadow-[0_0_20px_rgba(20,180,180,0.3)] transition-all">
                  <ExternalLink size={16} /> Entrar na Videoconferência
                </a>
              ) : (
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="w-full px-4 py-2.5 bg-surface border border-border text-text-primary rounded-xl text-sm font-medium hover:bg-surface-hover transition-colors"
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
