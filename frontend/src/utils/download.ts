/**
 * Saves bytes the app fetched with the session to the viewer's device. Files
 * behind the API need the sign-in token, which a plain link never sends.
 */
export function saveFile(data: Blob | ArrayBuffer, filename: string, type?: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a moment later: some browsers start the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
