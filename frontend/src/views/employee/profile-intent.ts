/**
 * "Edit" from the People list opens the employee's page on Personal with the
 * edit form open. The request rides in the URL (kept across the view change)
 * and is read once by the page, which then removes it, so a reload or Back
 * does not reopen the form.
 */
const PARAM = 'profile';
const EDIT_PERSONAL = 'edit-personal';

export function requestProfileEdit() {
  const params = new URLSearchParams(window.location.search);
  params.set(PARAM, EDIT_PERSONAL);
  window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
}

/** True once if an edit was requested; the request is cleared either way. */
export function takeProfileEditRequest(): boolean {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get(PARAM) === EDIT_PERSONAL;
  if (params.has(PARAM)) {
    params.delete(PARAM);
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
  return requested;
}
