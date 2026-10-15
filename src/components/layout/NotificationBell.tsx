import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { AppNotification, AppSection } from '@/lib/stecsecure-types';
import { formatDateTime } from '@/lib/utils';

// Phase 22: in-app notifications — unread count, list, and a pop-up when something new arrives
export const NotificationBell: React.FC<{ onNavigate: (section: AppSection) => void }> = ({ onNavigate }) => {
  const { notifications, currentUser, markNotificationsRead, canAccessSection } = useStecSecure();
  const [open, setOpen] = useState(false);
  const me = currentUser?.id ?? '';
  const isUnread = (n: AppNotification) => !n.readBy.includes(me);
  const unreadCount = notifications.filter(isUnread).length;

  // Pop up notifications that arrive while the app is open (not the backlog from before login)
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(notifications.map((n) => n.id));
      return;
    }
    for (const n of notifications) {
      if (seenRef.current.has(n.id)) continue;
      seenRef.current.add(n.id);
      if (isUnread(n)) toast.info(n.title, { description: n.body });
    }
  }, [notifications]);

  const openNotification = (n: AppNotification) => {
    setOpen(false);
    if (isUnread(n)) void markNotificationsRead([n.id]).catch(() => undefined);
    if (n.section && canAccessSection(n.section as AppSection)) onNavigate(n.section as AppSection);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white border border-slate-200 shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markNotificationsRead().catch(() => undefined)}
                className="text-[11px] font-semibold text-orange-600 hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">No notifications yet.</p>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer ${
                    isUnread(n) ? 'bg-orange-50/60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isUnread(n) && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />}
                    <div className="min-w-0">
                      <div className={`text-xs ${isUnread(n) ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                        {n.title}
                      </div>
                      {n.body && <div className="text-[11px] text-slate-500 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
