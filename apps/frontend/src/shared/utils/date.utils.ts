export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function checkIsOverdue(dueDateStr?: string | null, status?: string): boolean {
  if (!dueDateStr || status === 'DONE') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDateStr);
  if (match) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return `${match[1]}-${match[2]}-${match[3]}` < todayStr;
  }
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

export interface DeadlineDisplayInfo {
  state: 'none' | 'overdue' | 'today' | 'soon' | 'normal';
  formatted: string;
  badgeText?: string;
  color: 'error' | 'warning' | 'gold' | 'default';
}

export function getDeadlineDisplayState(
  dueDateStr?: string | null,
  status?: string,
  referenceDate: Date = new Date(),
): DeadlineDisplayInfo {
  if (!dueDateStr) {
    return { state: 'none', formatted: '', color: 'default' };
  }
  const formatted = formatDate(dueDateStr);
  if (!formatted) {
    return { state: 'none', formatted: '', color: 'default' };
  }
  if (status === 'DONE') {
    return { state: 'normal', formatted, badgeText: undefined, color: 'default' };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDateStr);
  if (!match) {
    return { state: 'normal', formatted, badgeText: undefined, color: 'default' };
  }

  const dueUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const vnTodayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate);
  const [ty, tm, td] = vnTodayStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((dueUtc - todayUtc) / 86400000);

  if (diffDays < 0) {
    return { state: 'overdue', formatted, badgeText: 'Quá hạn', color: 'error' };
  }
  if (diffDays === 0) {
    return { state: 'today', formatted, badgeText: 'Hôm nay', color: 'warning' };
  }
  if (diffDays <= 3) {
    return {
      state: 'soon',
      formatted,
      badgeText: `Còn ${diffDays} ngày`,
      color: 'gold',
    };
  }
  return { state: 'normal', formatted, badgeText: undefined, color: 'default' };
}
