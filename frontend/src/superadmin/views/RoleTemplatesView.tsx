import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PermissionCatalogSection, platformOperationsApi, RoleTemplate } from '../api/platform-operations.api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorBanner, Panel } from '../components/DetailList';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '../components/form-styles';
import { Field } from '../components/FormField';
import { toast } from '../../lib/toast';

const KIND_LABEL: Record<RoleTemplate['kind'], string> = {
  OWNER: 'Workspace owner · always every permission',
  SYSTEM: 'Built in',
  CUSTOM: 'Custom',
};

const ROLE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

type Editing = { mode: 'create' } | { mode: 'edit'; template: RoleTemplate };

/**
 * Role templates: the starting permissions of workspace roles. A template's
 * permissions are copied when a workspace role is created from it, so editing
 * a template changes roles created afterwards and never a role a workspace
 * already has. Permissions are the granular keys of the one permission catalog.
 */
export const RoleTemplatesView: React.FC = () => {
  const [data, setData] = useState<{ catalog: PermissionCatalogSection[]; templates: RoleTemplate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoleTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await platformOperationsApi.roleTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load role templates.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await platformOperationsApi.deleteRoleTemplate(pendingDelete.code);
      toast.success('Role template deleted successfully');
      setPendingDelete(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The template could not be deleted.';
      setDeleteError(message);
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;
  if (!data) {
    return (
      <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none">
        <span className="sr-only">Loading role templates</span>
      </div>
    );
  }

  if (editing) {
    return (
      <TemplateEditor
        catalog={data.catalog}
        template={editing.mode === 'edit' ? editing.template : null}
        onSaved={async () => {
          await load();
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="role-templates-heading">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <h2 id="role-templates-heading" className="text-sm font-bold text-hq-foreground">
            Role templates
          </h2>
          <p className="text-xs text-hq-muted-foreground">
            The permissions a workspace role starts with when it is created from a template. Editing a template affects roles created
            afterwards; roles a workspace already has keep their own permissions, which its administrators manage.
          </p>
        </div>
        <button type="button" onClick={() => setEditing({ mode: 'create' })} className={`${primaryButtonClass} shrink-0`}>
          New template
        </button>
      </div>
      <ul className="space-y-3">
        {data.templates.map((template) => (
          <li key={template.code} className="border border-hq-border rounded-xl bg-hq-card">
            <details>
              <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded-xl">
                <span className="min-w-0">
                  <span className="text-sm font-bold text-hq-foreground break-words">{template.name}</span>{' '}
                  <span className="font-mono text-[10px] text-hq-link">{template.code}</span>
                  <span className="ml-2 text-[11px] text-hq-muted-foreground">{KIND_LABEL[template.kind]}</span>
                  {template.description && <span className="block text-xs text-hq-muted-foreground mt-0.5 break-words">{template.description}</span>}
                </span>
                <span className="text-xs text-hq-muted-foreground tabular-nums">
                  {template.permissions.length} permissions · used by {template.workspaces} workspace{template.workspaces === 1 ? '' : 's'} ·{' '}
                  {template.activeMembers} active member{template.activeMembers === 1 ? '' : 's'}
                </span>
              </summary>
              <div className="px-4 pb-4 space-y-3">
                {(template.editable || template.deletable) && (
                  <div className="flex flex-wrap gap-2">
                    {template.editable && (
                      <button type="button" onClick={() => setEditing({ mode: 'edit', template })} className={secondaryButtonClass}>
                        Edit<span className="sr-only"> {template.name}</span>
                      </button>
                    )}
                    {template.deletable && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete(template);
                        }}
                        className={`${secondaryButtonClass} text-hq-danger border-hq-danger/40`}
                      >
                        Delete<span className="sr-only"> {template.name}</span>
                      </button>
                    )}
                  </div>
                )}
                <GrantedPermissions catalog={data.catalog} granted={template.permissions} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete the ${pendingDelete.name} role template?`}
          confirmLabel="Delete template"
          busyLabel="Deleting…"
          tone="danger"
          isBusy={isDeleting}
          error={deleteError}
          onConfirm={() => void remove()}
          onCancel={() => setPendingDelete(null)}
        >
          <p>New workspace roles can no longer be created from it.</p>
          <p>
            {pendingDelete.workspaces > 0
              ? `The ${pendingDelete.workspaces} workspace${pendingDelete.workspaces === 1 ? '' : 's'} that already have a ${pendingDelete.code} role keep it, with its permissions and members.`
              : 'No workspace has a role created from it.'}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
};

const GrantedPermissions: React.FC<{ catalog: PermissionCatalogSection[]; granted: string[] }> = ({ catalog, granted }) => {
  const has = new Set(granted);
  const sections = catalog
    .map((section) => ({
      section: section.section,
      groups: section.groups
        .map((group) => ({ group: group.group, permissions: group.permissions.filter((p) => has.has(p.key)) }))
        .filter((group) => group.permissions.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
  if (sections.length === 0) return <p className="text-xs text-hq-muted-foreground">No permissions: a role from this template starts with no access.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {sections.map((section) => (
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
  );
};

const TemplateEditor: React.FC<{
  catalog: PermissionCatalogSection[];
  template: RoleTemplate | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}> = ({ catalog, template, onSaved, onCancel }) => {
  const formId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [granted, setGranted] = useState<Set<string>>(() => new Set(template?.permissions ?? []));
  const [problems, setProblems] = useState<{ code?: string; name?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => headingRef.current?.focus(), []);

  const toggle = (keys: string[], on: boolean) =>
    setGranted((current) => {
      const next = new Set(current);
      keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    const normalizedCode = code.trim().toUpperCase();
    const found = {
      ...(template || ROLE_CODE.test(normalizedCode) ? {} : { code: '2–64 capital letters, digits or underscores, starting with a letter.' }),
      ...(!template && normalizedCode === 'ADMIN' ? { code: 'ADMIN is the built-in Administrator role.' } : {}),
      ...(name.trim().length >= 2 ? {} : { name: 'Enter a name (at least 2 characters).' }),
    };
    setProblems(found);
    if (Object.keys(found).length > 0) return;

    const input = { name: name.trim(), description: description.trim(), permissions: [...granted] };
    setIsSaving(true);
    setError(null);
    try {
      if (template) {
        await platformOperationsApi.updateRoleTemplate(template.code, input);
        toast.success('Role template updated successfully');
      } else {
        await platformOperationsApi.createRoleTemplate({ ...input, code: normalizedCode });
        toast.success('Role template created successfully');
      }
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The template could not be saved.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel
      title={template ? `Edit ${template.name}` : 'New role template'}
      description="Changes apply to workspace roles created from this template from now on. Roles that already exist keep their permissions."
    >
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {template ? `Edit ${template.name}` : 'New role template'}
      </h2>
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={isSaving} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {template ? (
            <div>
              <p className="block text-[11px] font-semibold text-hq-muted-foreground mb-1">Code</p>
              <p className="font-mono text-xs text-hq-link">{template.code}</p>
              <p className="mt-1 text-[11px] text-hq-subtle-foreground">Codes cannot change: workspace roles are matched to templates by code.</p>
            </div>
          ) : (
            <Field id={`${formId}-code`} label="Code" required error={problems.code} hint="For example SALES_REP. It cannot be changed later.">
              {(props) => <input {...props} value={code} maxLength={64} onChange={(e) => setCode(e.target.value)} className={`${fieldClass} font-mono uppercase`} />}
            </Field>
          )}
          <Field id={`${formId}-name`} label="Name" required error={problems.name}>
            {(props) => <input {...props} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={fieldClass} />}
          </Field>
          <div className="md:col-span-2">
            <Field id={`${formId}-description`} label="Description">
              {(props) => (
                <textarea {...props} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={`${fieldClass} h-auto py-2`} />
              )}
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-hq-foreground" aria-live="polite">
            Permissions <span className="font-normal text-hq-muted-foreground">({granted.size} selected)</span>
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {catalog.map((section) => {
              const keys = section.groups.flatMap((g) => g.permissions.map((p) => p.key));
              const all = keys.every((key) => granted.has(key));
              return (
                <fieldset key={section.section} className="rounded-lg border border-hq-border p-3 min-w-0">
                  <legend className="px-1 text-xs font-bold text-hq-foreground">{section.section}</legend>
                  <button type="button" onClick={() => toggle(keys, !all)} className="text-[11px] font-semibold text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded">
                    {all ? 'Clear all' : 'Select all'}
                    <span className="sr-only"> in {section.section}</span>
                  </button>
                  {section.groups.map((group) => (
                    <div key={group.group} className="mt-2">
                      <p className="text-[11px] font-semibold text-hq-muted-foreground">{group.group}</p>
                      <ul className="mt-1 space-y-1">
                        {group.permissions.map((permission) => (
                          <li key={permission.key}>
                            <label className="flex items-start gap-2 text-xs text-hq-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={granted.has(permission.key)}
                                onChange={(e) => toggle([permission.key], e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-hq-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
                              />
                              <span className="min-w-0">
                                {permission.name} <span className="font-mono text-[10px] text-hq-subtle-foreground">{permission.key}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </fieldset>
              );
            })}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-hq-danger/30 bg-hq-danger/10 px-3 py-2 text-xs text-hq-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? 'Saving…' : template ? 'Save template' : 'Create template'}
          </button>
          <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
};
