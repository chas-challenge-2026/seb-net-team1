/** Saves a blob as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves text (e.g. a generated CSV template) as a file download. */
export function saveText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  saveBlob(new Blob([text], { type }), filename);
}
