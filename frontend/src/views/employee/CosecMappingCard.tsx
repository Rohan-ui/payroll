import React, { useCallback, useEffect, useId, useState } from 'react';
import { Fingerprint, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Clock, Link2, Unlink } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import {
  employeesApi,
  type EmployeeCosecMapping,
  type CosecLookupResult,
} from '../../api/employees.api';

interface Props {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
}

type MappingBadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'purple';

const STATUS_BADGE: Record<string, { label: string; variant: MappingBadgeVariant; icon: React.ElementType }> = {
  MAPPED: { label: 'Mapped to COSEC', variant: 'success', icon: CheckCircle2 },
  MAPPING_PENDING: { label: 'COSEC Mapping Pending', variant: 'warning', icon: Clock },
  NOT_FOUND: { label: 'COSEC Employee Not Found', variant: 'danger', icon: AlertCircle },
  REQUIRES_REVIEW: { label: 'Mapping Requires Review', variant: 'purple', icon: AlertTriangle },
  SYNC_ERROR: { label: 'Sync Error', variant: 'danger', icon: AlertTriangle },
};

export const CosecMappingCard: React.FC<Props> = ({ employeeId, employeeCode, employeeName }) => {
  const { can } = useAuth();
  const canManage = can('people.update') || can('attendance.integration.update');
  const [mapping, setMapping] = useState<EmployeeCosecMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    employeesApi
      .getCosecMapping(employeeId)
      .then((data) => {
        setMapping(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Could not load COSEC mapping');
        setLoading(false);
      });
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSyncAttendance = async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    setSyncing(true);
    try {
      const result = await employeesApi.refreshEmployeeAttendance(employeeId, currentMonth);
      if (result.status === 'NOT_CONFIGURED') {
        toast.error('COSEC API is not configured in workspace settings.');
      } else {
        toast.success(
          result.changedRecords !== undefined
            ? `Synced from COSEC: ${result.changedRecords} day(s) updated.`
            : 'Attendance synced from COSEC.',
        );
        load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'COSEC sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const statusKey = mapping?.mappingStatus || 'MAPPING_PENDING';
  const badgeConfig = STATUS_BADGE[statusKey] || STATUS_BADGE.MAPPING_PENDING;
  const StatusIcon = badgeConfig.icon;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-teal-500" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            COSEC Attendance Integration
          </h3>
        </div>
        {mapping?.isCosecConfigured && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSyncAttendance}
            disabled={syncing}
            loading={syncing}
            title="Sync attendance records from COSEC device"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        )}
      </div>

      {loading && (
        <div className="h-16 animate-pulse rounded bg-slate-50 dark:bg-white/5" aria-busy="true">
          <span className="sr-only" role="status">Loading COSEC integration...</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
          {error}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && mapping && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Badge variant={badgeConfig.variant} size="sm" className="flex items-center gap-1">
                <StatusIcon className="w-3 h-3" />
                {badgeConfig.label}
              </Badge>
            </div>
            {mapping.verificationStatus === 'VERIFIED' && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Verified in COSEC
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400">HRMS Code</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {mapping.employeeCode || employeeCode}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400">COSEC ID</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {mapping.cosecEmployeeId || (
                  <span className="text-amber-600 dark:text-amber-400 font-normal italic">Not mapped</span>
                )}
              </span>
            </div>
          </div>

          {mapping.lastSyncedAt && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-600 dark:text-slate-300">Last Synced:</span>{' '}
              {new Date(mapping.lastSyncedAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {mapping.lastSyncResult && (
                <span className="block text-[10px] text-slate-400 mt-0.5">{mapping.lastSyncResult}</span>
              )}
            </div>
          )}

          {mapping.reviewNotes && (
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-[11px] text-amber-800 dark:text-amber-300">
              {mapping.reviewNotes}
            </div>
          )}

          {!mapping.isCosecConfigured && (
            <p className="text-[11px] text-slate-400 italic">
              COSEC is not configured in workspace settings. Mappings will take effect when COSEC settings are saved.
            </p>
          )}

          {canManage && (
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(true)}
                className="w-full text-xs"
              >
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                {mapping.cosecEmployeeId ? 'Edit COSEC Mapping' : 'Map to COSEC ID'}
              </Button>
            </div>
          )}
        </div>
      )}

      {dialogOpen && mapping && (
        <EditMappingDialog
          employeeId={employeeId}
          employeeCode={mapping.employeeCode || employeeCode}
          employeeName={mapping.employeeName || employeeName}
          currentCosecId={mapping.cosecEmployeeId || ''}
          currentNotes={mapping.reviewNotes || ''}
          onClose={() => setDialogOpen(false)}
          onSaved={(newMapping) => {
            setMapping(newMapping);
            setDialogOpen(false);
          }}
        />
      )}
    </Card>
  );
};

interface EditMappingDialogProps {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  currentCosecId: string;
  currentNotes: string;
  onClose: () => void;
  onSaved: (mapping: EmployeeCosecMapping) => void;
}

const EditMappingDialog: React.FC<EditMappingDialogProps> = ({
  employeeId,
  employeeCode,
  employeeName,
  currentCosecId,
  currentNotes,
  onClose,
  onSaved,
}) => {
  const id = useId();
  const [cosecId, setCosecId] = useState(currentCosecId);
  const [notes, setNotes] = useState(currentNotes);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<CosecLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    const trimmed = cosecId.trim();
    if (!trimmed) {
      setError('Enter a COSEC Employee ID to validate.');
      return;
    }
    setError(null);
    setLookingUp(true);
    try {
      const res = await employeesApi.lookupCosecUser(trimmed);
      setLookupResult(res);
      if (res.alreadyMapped && res.alreadyMappedTo && res.alreadyMappedTo.employeeId !== employeeId) {
        setError(
          `COSEC ID "${trimmed}" is already mapped to ${res.alreadyMappedTo.employeeName} (${res.alreadyMappedTo.employeeCode}).`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = cosecId.trim();
    if (!trimmed) {
      setError('COSEC Employee ID cannot be blank. Use Remove Mapping to clear.');
      return;
    }
    if (lookupResult?.alreadyMapped && lookupResult.alreadyMappedTo?.employeeId !== employeeId) {
      setError(`Cannot map: ID already assigned to another employee.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await employeesApi.setCosecMapping(employeeId, {
        cosecEmployeeId: trimmed,
        notes: notes.trim() || undefined,
      });
      toast.success(`COSEC ID mapped successfully to ${trimmed}`);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mapping');
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Remove COSEC mapping for ${employeeName}? Attendance sync will stop until mapped again.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await employeesApi.removeCosecMapping(employeeId);
      toast.success('COSEC mapping removed. Status is now pending.');
      const updated = await employeesApi.getCosecMapping(employeeId);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove mapping');
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Enter or Correct COSEC Employee ID"
      description={`Map biometric & attendance punches from Matrix COSEC to ${employeeName} (${employeeCode}).`}
      onClose={onClose}
      footer={
        <>
          {currentCosecId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={saving}
              className="mr-auto text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900/40"
            >
              <Unlink className="w-3.5 h-3.5 mr-1" />
              Remove Mapping
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={id} loading={saving} disabled={saving || !cosecId.trim()}>
            Save Mapping
          </Button>
        </>
      }
    >
      <form id={id} onSubmit={handleSave} className="space-y-4 text-xs">
        {error && (
          <div role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-800">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            COSEC User ID / Employee Code <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={cosecId}
              onChange={(e) => {
                setCosecId(e.target.value);
                setLookupResult(null);
                setError(null);
              }}
              placeholder="e.g. EMP001 or 101"
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLookup}
              disabled={lookingUp || !cosecId.trim()}
              loading={lookingUp}
            >
              Verify in COSEC
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Must match the User ID configured in Matrix COSEC Centra / Biometric device.
          </p>
        </div>

        {lookupResult && (
          <div
            className={`p-3 rounded-xl border text-xs ${
              lookupResult.alreadyMapped && lookupResult.alreadyMappedTo?.employeeId !== employeeId
                ? 'border-red-200 bg-red-50 text-red-900'
                : lookupResult.existsInCosec
                ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
            }`}
          >
            {lookupResult.existsInCosec ? (
              <div>
                <p className="font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" /> Found in COSEC
                </p>
                <p className="mt-1">
                  Name: <span className="font-medium">{lookupResult.cosecUser?.name}</span>
                  {lookupResult.cosecUser?.department && (
                    <span> · Dept: {lookupResult.cosecUser.department}</span>
                  )}
                  {lookupResult.cosecUser?.email && (
                    <span> · Email: {lookupResult.cosecUser.email}</span>
                  )}
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" /> Not found in COSEC
                </p>
                <p className="mt-1 text-[11px]">
                  ID is not currently present in COSEC. You can still save this mapping; punches will sync once the employee is enrolled on the device.
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Notes / Reason (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Mapped manually per HR record, device punch card #101"
            rows={2}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </form>
    </Dialog>
  );
};
