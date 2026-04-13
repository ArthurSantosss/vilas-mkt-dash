import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PRESETS,
  formatYMD,
  parseYMD,
  getMonthDays,
  getFirstDayPadding,
  isDateInRange,
  formatSelectedRangeForDisplay,
  getPresetLabelById,
  getToday
} from '../utils/dateUtils';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function PeriodSelector({ selectedPeriod, onPeriodChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const initialSelection = useMemo(() => {
    if (typeof selectedPeriod === 'object' && selectedPeriod?.type === 'custom') {
      return { id: 'custom', startDate: selectedPeriod.startDate, endDate: selectedPeriod.endDate };
    }
    const preset = PRESETS.find(p => p.id === selectedPeriod);
    if (preset) {
      const range = preset.getRange();
      return { id: preset.id, startDate: range.startDate, endDate: range.endDate };
    }
    const d7 = PRESETS.find(p => p.id === '7d').getRange();
    return { id: '7d', startDate: d7.startDate, endDate: d7.endDate };
  }, [selectedPeriod]);

  const [tempSelection, setTempSelection] = useState(initialSelection);
  const [viewState, setViewState] = useState(() => {
    const end = tempSelection.endDate ? parseYMD(tempSelection.endDate) : new Date();
    let y = end.getFullYear();
    let m = end.getMonth() - 1;
    if (m < 0) { m = 11; y -= 1; }
    return { year: y, month: m };
  });

  const [selectionStep, setSelectionStep] = useState(0);
  const [hoverDate, setHoverDate] = useState(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Resetting local UI state when popover opens is intentional
      setTempSelection(initialSelection);
      const end = initialSelection.endDate ? parseYMD(initialSelection.endDate) : new Date();
      let y = end.getFullYear();
      let m = end.getMonth() - 1;
      if (m < 0) { m = 11; y -= 1; }
      setViewState({ year: y, month: m });
      setSelectionStep(0);
    }
  }, [isOpen, initialSelection]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    let finalSelection = { ...tempSelection };
    if (selectionStep === 1) {
       finalSelection.endDate = finalSelection.startDate;
    }
    if (finalSelection.startDate && finalSelection.endDate) {
       const s = parseYMD(finalSelection.startDate).getTime();
       const e = parseYMD(finalSelection.endDate).getTime();
       if (s > e) {
         const t = finalSelection.startDate;
         finalSelection.startDate = finalSelection.endDate;
         finalSelection.endDate = t;
       }
    }
    if (finalSelection.id && finalSelection.id !== 'custom') {
      onPeriodChange(finalSelection.id);
    } else {
      onPeriodChange({ type: 'custom', startDate: finalSelection.startDate, endDate: finalSelection.endDate });
    }
    setIsOpen(false);
  };

  const handlePresetClick = (preset) => {
    const range = preset.getRange();
    setTempSelection({ id: preset.id, startDate: range.startDate, endDate: range.endDate });
    setSelectionStep(0);
  };

  const shiftMonth = (offset) => {
    setViewState(prev => {
      let m = prev.month + offset;
      let y = prev.year;
      if (m > 11) { m -= 12; y++; }
      if (m < 0) { m += 12; y--; }
      return { year: y, month: m };
    });
  };

  const handleDayClick = (dateStr) => {
    if (selectionStep === 0 || selectionStep === 2) {
      setTempSelection({ id: 'custom', startDate: dateStr, endDate: dateStr });
      setSelectionStep(1);
    } else if (selectionStep === 1) {
      setTempSelection(prev => ({ ...prev, endDate: dateStr }));
      setSelectionStep(2);
    }
  };

  const handleDayHover = (dateStr) => {
    if (selectionStep === 1) {
      setHoverDate(dateStr);
    }
  };

  const renderCalendar = (year, month) => {
    const days = getMonthDays(year, month);
    const padding = getFirstDayPadding(year, month);
    const todayStr = formatYMD(getToday());

    let s = tempSelection.startDate;
    let e = selectionStep === 1 ? hoverDate || tempSelection.startDate : tempSelection.endDate;

    if (s && e) {
        const sTime = parseYMD(s).getTime();
        const eTime = parseYMD(e).getTime();
        if (sTime > eTime) { const tmp = s; s = e; e = tmp; }
    }

    return (
      <div className="flex flex-col">
        {/* Month Header */}
        <div className="flex items-center justify-center mb-3">
          <span className="text-sm font-semibold text-text-primary tracking-wide capitalize">{MONTHS[month]} {year}</span>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 mb-1.5">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-text-secondary/50 uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: padding }).map((_, i) => (
            <div key={`empty-${i}`} className="w-9 h-9" />
          ))}
          {days.map(date => {
            const dateStr = formatYMD(date);
            const isToday = dateStr === todayStr;
            const isStart = dateStr === s;
            const isEnd = dateStr === e;
            const inRange = isDateInRange(date, s, e);
            const isSingleSelected = isStart && isEnd;

            let wrapBg = '';
            let cellBg = '';
            let textClass = 'text-text-primary/80';
            let roundedClass = '';
            let hoverClass = 'hover:bg-primary/10 hover:text-primary-light';

            if (inRange) {
              wrapBg = 'bg-primary/10';
              textClass = 'text-primary-light font-medium';
              hoverClass = '';

              if (isStart) roundedClass += ' rounded-l-full';
              if (isEnd) roundedClass += ' rounded-r-full';
              if (isSingleSelected) roundedClass = 'rounded-full';

              if (isStart || isEnd) {
                cellBg = 'bg-gradient-to-br from-primary to-primary-light shadow-[0_0_12px_rgba(15,165,174,0.3)]';
                textClass = 'text-white font-semibold';
              }
            } else if (isToday) {
              textClass = 'text-primary-light font-bold';
            }

            return (
              <div
                key={dateStr}
                onClick={() => handleDayClick(dateStr)}
                onMouseEnter={() => handleDayHover(dateStr)}
                className={`relative flex items-center justify-center w-full h-[34px] cursor-pointer ${wrapBg} ${roundedClass}`}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs transition-all duration-150 ${textClass} ${hoverClass} ${cellBg}`}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const rightMonth = viewState.month + 1 > 11 ? 0 : viewState.month + 1;
  const rightYear = viewState.month + 1 > 11 ? viewState.year + 1 : viewState.year;

  const currentLabel = initialSelection.id === 'custom'
      ? formatSelectedRangeForDisplay(initialSelection.startDate, initialSelection.endDate)
      : getPresetLabelById(initialSelection.id);

  return (
    <div className={`relative z-50 ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group w-full flex items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium
          bg-surface/60 backdrop-blur-md border border-border/50 text-text-primary
          hover:border-primary/30 hover:shadow-[0_0_16px_rgba(15,165,174,0.1)]
          focus:outline-none focus:ring-1 focus:ring-primary/40
          transition-all duration-300 shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <CalendarIcon size={15} className="text-primary-light/70 group-hover:text-primary-light transition-colors shrink-0" />
          <span className="whitespace-nowrap truncate">{currentLabel}</span>
        </div>
        <ChevronDown size={13} className={`shrink-0 text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-start sm:justify-end sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2"
          style={{ animation: 'fadeIn 200ms ease-out' }}
        >
          {/* Mobile backdrop */}
          <div className="fixed inset-0 bg-black/50 sm:hidden" onClick={() => setIsOpen(false)} />

          <div className="relative w-full sm:w-auto max-h-[85vh] sm:max-h-none overflow-y-auto flex flex-col rounded-t-2xl sm:rounded-2xl
            bg-surface/95 backdrop-blur-xl border border-border/60
            shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]">

          <div className="flex flex-col sm:flex-row border-b border-border/40">
            {/* Presets — horizontal scroll on mobile, sidebar on desktop */}
            <div className="sm:w-[170px] sm:border-r border-b sm:border-b-0 border-border/40 p-2 py-3">
              <div className="px-3 pb-2 text-[10px] font-semibold text-text-secondary/50 uppercase tracking-widest">
                Período
              </div>
              <ul className="flex sm:flex-col gap-1 sm:gap-0.5 mt-1 overflow-x-auto sm:overflow-x-visible pb-1 sm:pb-0">
                {PRESETS.map(preset => {
                  const isActive = tempSelection.id === preset.id;
                  return (
                    <li key={preset.id} className="shrink-0">
                      <button
                        onClick={() => handlePresetClick(preset)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 text-left whitespace-nowrap
                          ${isActive
                            ? 'bg-primary/15 text-primary-light font-semibold shadow-[inset_0_0_0_1px_rgba(15,165,174,0.2)]'
                            : 'text-text-primary/80 hover:bg-surface-hover hover:text-text-primary'}
                        `}
                      >
                        <div className={`w-2 h-2 rounded-full transition-all duration-200 shrink-0 ${isActive ? 'bg-primary-light shadow-[0_0_6px_rgba(32,207,207,0.5)]' : 'bg-text-secondary/20'}`} />
                        {preset.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Calendars Area — single column on mobile, two on desktop */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-8 relative sm:min-w-[540px]">
              {/* Nav Buttons */}
              <button
                onClick={() => shiftMonth(-1)}
                className="absolute left-3 sm:left-4 top-3 sm:top-4 p-1.5 rounded-lg bg-surface-hover/50 border border-border/30 text-text-secondary hover:text-primary-light hover:border-primary/30 hover:bg-primary/10 z-20 transition-all duration-200"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => shiftMonth(1)}
                className="absolute right-3 sm:right-4 top-3 sm:top-4 p-1.5 rounded-lg bg-surface-hover/50 border border-border/30 text-text-secondary hover:text-primary-light hover:border-primary/30 hover:bg-primary/10 z-20 transition-all duration-200"
              >
                <ChevronRight size={16} />
              </button>

              {/* Calendars */}
              <div className="flex-1 pt-2">
                {renderCalendar(viewState.year, viewState.month)}
              </div>
              <div className="hidden sm:block w-px bg-border/30 self-stretch my-2" />
              <div className="flex-1">
                {renderCalendar(rightYear, rightMonth)}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3.5 px-4 sm:px-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-border/30 bg-bg/30">
            {/* Date Range Display */}
            <div className="flex gap-2 items-center justify-center sm:justify-start">
              <div className="border border-border/40 bg-surface/50 rounded-lg px-3 py-1.5 text-xs font-medium text-text-primary/80 min-w-[100px] sm:min-w-[120px] text-center">
                {tempSelection.startDate ? formatSelectedRangeForDisplay(tempSelection.startDate, tempSelection.endDate).split(' - ')[0] : '—'}
              </div>
              <span className="text-text-secondary/40 text-xs">→</span>
              <div className="border border-border/40 bg-surface/50 rounded-lg px-3 py-1.5 text-xs font-medium text-text-primary/80 min-w-[100px] sm:min-w-[120px] text-center">
                {tempSelection.endDate ? formatSelectedRangeForDisplay(tempSelection.startDate, tempSelection.endDate).split(' - ')[1] : '—'}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs font-medium text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg hover:bg-surface-hover transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                disabled={!tempSelection.startDate || !tempSelection.endDate}
                className="px-5 py-2 rounded-lg text-xs font-semibold text-white
                  bg-gradient-to-r from-primary to-primary-light
                  shadow-[0_2px_8px_-2px_rgba(15,165,174,0.35)]
                  hover:shadow-[0_4px_16px_-4px_rgba(15,165,174,0.45)] hover:translate-y-[-1px]
                  active:translate-y-0 active:shadow-[0_1px_4px_-1px_rgba(15,165,174,0.3)]
                  disabled:opacity-40 disabled:hover:translate-y-0
                  transition-all duration-200"
              >
                Aplicar
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
