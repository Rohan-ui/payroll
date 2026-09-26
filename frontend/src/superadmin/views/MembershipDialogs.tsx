import React, { useEffect, useId, useRef, useState } from 'react';
import { platformDirectoryApi, TenantListItem, UserDetail } from '../api/platform-directory.api';
import { AssignableRole, platformOperationsApi } from '../api/platform-operations.api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { fieldClass, labelClass } from '../components/form-styles';
import { toast } from '../../lib/toast';

type Membership = UserDetail['memberships'][number];

export type MembershipAction =
  | { kind: 'role'; membership: Membership }
  | { kind: 'status'; membership: Membership; to: 'ACTIVE' | 'SUSPENDED' }
  | { kind: 'remove'; membership: Membership }
  | { kind: 'add'; restore?: Membership };

/**
 * The role picker for one workspace: its own active roles, then role templates
 * it does not have yet (choosing one creates that role in the workspace).
 */
const RoleSelect: React.FC<{
  tenantId: string;
  value: string;
  onChange: (code: string) => void;
  selectRef?: React.RefObject<HTMLSelectElement>;
}> = ({ tenantId, value, onChange, selectRef }) => {
  const id = useId();
  const [roles, setRoles] = useState<AssignableRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRoles(null);
    setError(null);
    platformOperationsApi
      .assignableRoles(tenantId)
      .then((list) => !cancelled && setRoles(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the roles.'));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (error) return <p role="alert" className="text-hq-danger">{error}</p>;
  const workspace = roles?.filter((r) => r.source === 'WORKSPACE') ?? [];
  const templates = roles?.filter((r) => r.source === 'TEMPLATE') ?? [];
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        Role
      </label>
      <select id={id} ref={selectRef} value={value} disabled={!roles} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">{roles ? 'Choose a role' : 'Loading roles…'}</option>
        {workspace.length > 0 && (
          <optgroup label="This workspace's roles">
            {workspace.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </optgroup>
        )}
        {templates.length > 0 && (
          <optgroup label="New role from a template">
            {templates.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
};

/** Workspace search for adding a membership; searches on the server, ten results at a time. */
const WorkspacePicker: React.FC<{ value: string; onChange: (tenantId: string) => void; inputRef: React.RefObject<HTMLInputElement> }> = ({
  value,
  onChange,
  inputRef,
}) => {
  const id = useId();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TenantListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      platformDirectoryApi
        .listTenants({ page: 1, pageSize: 10, search: search.trim() || undefined, sort: 'name', order: 'asc' })
        .then((page) => {
          if (cancelled) return;
          setResults(page.items);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not search workspaces.'));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`${id}-search`} className={labelClass}>
          Find a workspace
        </label>
        <input
          id={`${id}-search`}
          ref={inputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, code or address"
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-workspace`} className={labelClass}>
          Workspace
        </label>
        <select id={`${id}-workspace`} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
          <option value="">{results.length > 0 ? 'Choose a workspace' : 'No matching workspaces'}</option>
          {results.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.tenantCode})
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert" className="text-hq-danger">{error}</p>}
    </div>
  );
};

/**
 * One membership change, confirmed with what it will do. Every change is made
 * by the server, which keeps a workspace from losing its last active
 * administrator; removal archives the membership and never deletes the account.
 */
export const MembershipDialog: React.FC<{
  userId: string;
  userLabel: string;
  action: MembershipAction;
  onDone: () => Promise<void>;
  onCancel: () => void;
}> = ({ userId, userLabel, action, onDone, onCancel }) => {
  const [roleCode, setRoleCode] = useState('');
  const [tenantId, setTenantId] = useState(action.kind === 'add' && action.restore ? action.restore.tenantId : '');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const run = async (request: () => Promise<unknown>, success: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await request();
      toast.success(success);
      await onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The membership could not be changed.';
      setError(message);
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const requireRole = (then: () => void) => {
    if (!roleCode) {
      setError('Choose a role.');
      return;
    }
    then();
  };

  if (action.kind === 'role') {
    const m = action.membership;
    return (
      <ConfirmDialog
        title={`Change ${userLabel}'s role in ${m.tenantName}?`}
        confirmLabel="Change role"
        busyLabel="Saving…"
        tone="primary"
        isBusy={isBusy}
        error={error}
        initialFocus={selectRef}
        onConfirm={() => requireRole(() => void run(() => platformOperationsApi.updateMembership(userId, m.memberId, { roleCode }), 'Role updated successfully'))}
        onCancel={onCancel}
      >
        <p>Current role: {m.roles.map((r) => r.name).join(', ') || 'none'}. Their access in this workspace changes on their next request.</p>
        <RoleSelect tenantId={m.tenantId} value={roleCode} onChange={setRoleCode} selectRef={selectRef} />
      </ConfirmDialog>
    );
  }

  if (action.kind === 'status') {
    const m = action.membership;
    const suspending = action.to === 'SUSPENDED';
    return (
      <ConfirmDialog
        title={suspending ? `Suspend ${userLabel} in ${m.tenantName}?` : `Reactivate ${userLabel} in ${m.tenantName}?`}
        confirmLabel={suspending ? 'Suspend membership' : 'Reactivate membership'}
        busyLabel="Saving…"
        tone={suspending ? 'danger' : 'primary'}
        isBusy={isBusy}
        error={error}
        onConfirm={() =>
          void run(
            () => platformOperationsApi.updateMembership(userId, m.memberId, { status: action.to }),
            suspending ? 'Membership suspended successfully' : 'Membership reactivated successfully',
          )
        }
        onCancel={onCancel}
      >
        <p>
          {suspending
            ? `They are signed out of ${m.tenantName} now and cannot sign in to it until reactivated. Their account, their other workspaces and their role are not changed.`
            : `They can sign in to ${m.tenantName} again with their existing role.`}
        </p>
      </ConfirmDialog>
    );
  }

  if (action.kind === 'remove') {
    const m = action.membership;
    return (
      <ConfirmDialog
        title={`Remove ${userLabel} from ${m.tenantName}?`}
        confirmLabel="Remove from workspace"
        busyLabel="Removing…"
        tone="danger"
        isBusy={isBusy}
        error={error}
        onConfirm={() => void run(() => platformOperationsApi.removeMembership(userId, m.memberId), 'User removed from workspace successfully')}
        onCancel={onCancel}
      >
        <p>They lose access to {m.tenantName} at once and their role there is withdrawn. The membership stays on record as removed.</p>
        <p>Their user account and their other workspaces are not changed; the account is never deleted.</p>
      </ConfirmDialog>
    );
  }

  const restore = action.restore;
  return (
    <ConfirmDialog
      title={restore ? `Add ${userLabel} back to ${restore.tenantName}?` : `Add ${userLabel} to a workspace`}
      confirmLabel="Add to workspace"
      busyLabel="Adding…"
      tone="primary"
      isBusy={isBusy}
      error={error}
      initialFocus={restore ? selectRef : searchRef}
      onConfirm={() => {
        if (!tenantId) {
          setError('Choose a workspace.');
          return;
        }
        requireRole(() => void run(() => platformOperationsApi.addMembership(userId, { tenantId, roleCode }), 'User added to workspace successfully'));
      }}
      onCancel={onCancel}
    >
      {!restore && (
        <WorkspacePicker
          value={tenantId}
          onChange={(value) => {
            setTenantId(value);
            setRoleCode('');
          }}
          inputRef={searchRef}
        />
      )}
      {tenantId && <RoleSelect tenantId={tenantId} value={roleCode} onChange={setRoleCode} selectRef={selectRef} />}
      <p className="text-hq-subtle-foreground">They sign in with their existing account and password; no new account is created.</p>
    </ConfirmDialog>
  );
};
