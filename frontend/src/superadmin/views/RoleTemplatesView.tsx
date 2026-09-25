import React, { useEffect, useState } from 'react';
import { platformGovernanceApi, RoleTemplate } from '../api/platform-governance.api';
import { ErrorBanner } from '../components/DetailList';
import { humanize } from '../format';

/**
 * The built-in roles a workspace starts with, and the permissions each is
 * granted on creation. Read from the permission catalog; each workspace then
 * manages its own copies under Organization & Settings → Roles.
 */
export const RoleTemplatesView: React.FC = () => {
  const [templates, setTemplates] = useState<RoleTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformGovernanceApi
      .roleTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load role templates.'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!templates) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  return (
    <section className="space-y-4">
      <p className="text-xs text-hq-muted-foreground max-w-3xl">
        Built-in roles and the permissions a workspace's copy starts with. Changing a workspace's roles does not change these
        templates, and these are not edited here: they come from the permission catalog in code.
      </p>
      <ul className="space-y-3">
        {templates.map((template) => (
          <li key={template.code} className="border border-hq-border rounded-xl bg-hq-card">
            <details>
              <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded-xl">
                <span>
                  <span className="text-sm font-bold text-hq-foreground">{template.name ?? humanize(template.code)}</span>{' '}
                  <span className="font-mono text-[10px] text-hq-link">{template.code}</span>
                  {template.isOwnerRole && <span className="ml-2 text-[11px] text-hq-muted-foreground">Workspace owner · holds every permission</span>}
                </span>
                <span className="text-xs text-hq-muted-foreground tabular-nums">
                  {template.permissionCount} permissions · used by {template.workspaces} workspace{template.workspaces === 1 ? '' : 's'} ·{' '}
                  {template.activeMembers} active member{template.activeMembers === 1 ? '' : 's'}
                </span>
              </summary>
              <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {template.sections.map((section) => (
                  <div key={section.section} className="rounded-lg border border-hq-border p-3">
                    <p className="text-xs font-bold text-hq-foreground mb-2">{section.section}</p>
                    {section.groups.map((group) => (
                      <div key={group.group} className="mb-2 last:mb-0">
                        <p className="text-[11px] font-semibold text-hq-muted-foreground">{group.group}</p>
                        <ul className="text-[11px] text-hq-foreground/90 space-y-0.5 mt-0.5">
                          {group.permissions.map((permission) => (
                            <li key={permission.key}>{permission.name}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
};
