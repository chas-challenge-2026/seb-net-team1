const numberFormatter = new Intl.NumberFormat('sv-SE');
const percentFormatter = new Intl.NumberFormat('sv-SE', { style: 'percent', maximumFractionDigits: 1 });

/** "Lisa Persson" → "LP" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** "Lisa Persson" → "Lisa" */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "1 234" */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** 0.456 → "45,6 %" */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(Number.isFinite(ratio) ? ratio : 0);
}

/** "1 betalning" / "3 betalningar" */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** 1048576 → "1 MB", 2400 → "2,3 kB" */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
  }
  if (bytes >= 1024) {
    return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(bytes / 1024)} kB`;
  }
  return `${formatNumber(bytes)} byte`;
}
