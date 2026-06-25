import { useMemo, useState } from 'react';
import { Clock, MapPin, RefreshCw, CheckCircle2, CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { connectGoogleCalendar, fetchGoogleEvents } from '../api/googleCalendar';

interface Props {
  events: CalendarEvent[];
}

const DOT: Record<NonNullable<CalendarEvent['color']>, string> = {
  indigo: 'text-indigo-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'היום';
  if (d.toDateString() === tomorrow.toDateString()) return 'מחר';
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

export default function CalendarScreen({ events }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // קיבוץ אירועים לפי יום
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    [...events]
      .sort((a, b) => +new Date(a.start) - +new Date(b.start))
      .forEach((ev) => {
        const key = new Date(ev.start).toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
      });
    return Array.from(map.entries());
  }, [events]);

  const googleCount = events.filter((e) => e.source === 'google').length;

  const handleSync = async () => {
    setSyncing(true);
    await connectGoogleCalendar();
    const res = await fetchGoogleEvents();
    setSyncedAt(res.syncedAt);
    setSyncing(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-white">יומן ומשימות</h2>
        <button
          onClick={handleSync}
          className="text-xs flex items-center gap-1.5 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-full px-3 py-1.5 hover:bg-indigo-600/30 transition-colors"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          סנכרון Google
        </button>
      </div>

      {grouped.map(([day, list]) => (
        <div key={day} className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <CalendarDays size={13} /> {dayLabel(list[0].start)}
          </div>
          <div className="glass rounded-xl p-4 space-y-3">
            {list.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3">
                <div className={`flex flex-col items-center min-w-[44px] ${DOT[ev.color ?? 'indigo']}`}>
                  <Clock size={16} />
                  <span className="text-xs font-mono mt-1">{timeOf(ev.start)}</span>
                </div>
                <div className="flex-1 text-right border-r border-slate-800 pr-3">
                  <p className="text-sm font-bold text-white">{ev.title}</p>
                  {ev.location && (
                    <p className="text-xs text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                      {ev.location} <MapPin size={12} />
                    </p>
                  )}
                  {ev.source === 'google' && (
                    <p className="text-[10px] text-slate-600 mt-0.5">מסונכרן מ-Google Calendar</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs rounded-xl flex items-center gap-2">
        <CheckCircle2 size={16} />
        <span>
          {googleCount} אירועים סונכרנו מ-Google Calendar
          {syncedAt && ' • עודכן כעת'}
        </span>
      </div>
    </div>
  );
}
