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
