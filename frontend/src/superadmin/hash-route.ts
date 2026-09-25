import { useCallback, useEffect, useState } from 'react';

/**
 * The portal's address-bar routes: `#<section>` or `#<section>/<id>`, so a
 * workspace or a user can be linked to and the back button works.
 */
export function readHashRoute(hash: string = window.location.hash): { section: string; id: string | null } {
  const [section = '', id = ''] = hash.replace(/^#/, '').split('/');
  return { section, id: id || null };
}

export function hashRoute(section: string, id?: string | null): string {
  return id ? `#${section}/${id}` : `#${section}`;
}

/** The id in `#<section>/<id>` while that section is showing, kept in step with the address bar. */
export function useHashRouteId(section: string): string | null {
  const read = useCallback(() => {
    const route = readHashRoute();
    return route.section === section ? route.id : null;
  }, [section]);
  const [id, setId] = useState<string | null>(read);

  useEffect(() => {
    const sync = () => setId(read());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [read]);

  return id;
}
