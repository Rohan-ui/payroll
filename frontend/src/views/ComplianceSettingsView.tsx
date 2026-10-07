import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Shield,
  Building2,
  IndianRupee,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Link2,
  Loader2,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  Save,
  RefreshCw,
  Users,
  CalendarCheck,
  UserCheck,
  Clock,
  Calendar,
} from 'lucide-react';
import { CosecAutoSyncCard } from './attendance/CosecAutoSyncCard';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MOCK_COMPLIANCE } from '../mock/data';
import {
  externalApiClient,
  CosecConfig,
  CosecConfigPublic,
  CosecUser,
  CosecMonthlyAttendance,
  CosecDailyAttendance,
} from '../api/external-api.api';
import { usePayroll } from '../context/PayrollContext';

type Tab = 'components' | 'compliance' | 'org' | 'api-config';

const SALARY_COMPONENTS = [
  { code: 'BASIC',    name: 'Basic Salary',          type: 'PERCENTAGE', value: '40%', taxable: true,  statutory: true },
  { code: 'HRA',      name: 'House Rent Allowance',  type: 'PERCENTAGE', value: '20%', taxable: true,  statutory: false },
  { code: 'SPECIAL',  name: 'Special Allowance',      type: 'FORMULA',    value: 'Gross − Basic − HRA − Conv − Med', taxable: true, statutory: false },
  { code: 'CONV',     name: 'Conveyance Allowance',   type: 'FIXED',      value: '₹1,600', taxable: false, statutory: false },
  { code: 'MED',      name: 'Medical Allowance',      type: 'FIXED',      value: '₹1,250', taxable: false, statutory: false },
  { code: 'EPF_EMP',  name: 'EPF (Employee 12%)',     type: 'SYSTEM',     value: '12% of Basic', taxable: false, statutory: true },
  { code: 'ESIC_EMP', name: 'ESIC (Employee 0.75%)',  type: 'SYSTEM',     value: '0.75% of Gross', taxable: false, statutory: true },
  { code: 'PT',       name: 'Professional Tax',        type: 'SYSTEM',     value: 'State slab',  taxable: false, statutory: true },
];

const TYPE_BADGE: Record<string, 'info' | 'warning' | 'neutral' | 'purple'> = {
  PERCENTAGE: 'info',
  FORMULA:    'purple',
  FIXED:      'neutral',
  SYSTEM:     'warning',
};

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning'> = {
  PAID: 'success', OVERDUE: 'danger', PENDING: 'warning',
};

/* ── API Configuration Tab ──────────────────────────────────── */

function ApiConfigTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savedConfig, setSavedConfig] = useState<CosecConfigPublic | null>(null);
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'ok' | 'fail'>(null);
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [previewUsers, setPreviewUsers] = useState<CosecUser[]>([]);
  const [previewAttendance, setPreviewAttendance] = useState<CosecMonthlyAttendance[]>([]);
  const [previewDaily, setPreviewDaily] = useState<CosecDailyAttendance[]>([]);
  const [previewTab, setPreviewTab] = useState<'users' | 'daily' | 'monthly'>('users');
  const [loadingPreview, setLoadingPreview] = useState(false);
  // Why COSEC data could not be loaded (a wrong password, an unreachable server), shown rather than an empty list.
  const [previewError, setPreviewError] = useState<string | null>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const { refreshData } = usePayroll();

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      const [uRes, aRes, dRes] = await Promise.allSettled([
        externalApiClient.getUsers(),
        externalApiClient.getMonthlyAttendance('2026-09'),
        externalApiClient.getDailyAttendance('2026-09-01', '2026-09-21'),
      ]);
      if (uRes.status === 'fulfilled') setPreviewUsers(uRes.value.data || []);
      if (aRes.status === 'fulfilled') setPreviewAttendance(aRes.value.data || []);
      if (dRes.status === 'fulfilled') setPreviewDaily(dRes.value.data || []);
      const failed = [uRes, aRes, dRes].find((r): r is PromiseRejectedResult => r.status === 'rejected');
      setPreviewError(failed ? (failed.reason instanceof Error ? failed.reason.message : 'COSEC data could not be loaded.') : null);
    } catch {
      // preview error non-blocking
    } finally {
      setLoadingPreview(false);
    }
  };

  // Load existing config on mount
  useEffect(() => {
    externalApiClient.getCosecConfig()
      .then((cfg) => {
        if (cfg) {
          setSavedConfig(cfg);
          setBaseUrl(cfg.baseUrl);
          setUsername(cfg.username);
          loadPreview();
        }
      })
      .catch(() => setLoadError('Could not load existing configuration.'));
  }, []);

  const handleTest = async () => {
    if (!baseUrl.trim() || !username.trim()) {
      setTestStatus('fail');
      setTestMessage('Please fill in Base URL and Username before testing.');
      return;
    }
    if (!password && !savedConfig?.passwordSet) {
      setTestStatus('fail');
      setTestMessage('Please provide a Password before testing.');
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    try {
      // A blank password tests the saved one, with the address and username as typed.
      const result = await externalApiClient.testConnection({
        baseUrl: baseUrl.trim(),
        username: username.trim(),
        ...(password ? { password } : {}),
      });
      setTestStatus(result.ok ? 'ok' : 'fail');
      setTestMessage(result.message);
      if (result.ok) loadPreview();
    } catch (err: any) {
      setTestStatus('fail');
      setTestMessage(err?.message || 'Network error: could not reach server.');
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !username.trim()) {
      setTestStatus('fail');
      setTestMessage('Please fill in Base URL and Username.');
      return;
    }
    if (!password && !savedConfig?.passwordSet) {
      setTestStatus('fail');
      setTestMessage('Please enter a Password.');
      return;
    }
    setSaving(true);
    setSaveSuccess(false);
    try {
      // A blank password is not sent: the saved one is kept.
      const replacing = Boolean(password);
      const saved = await externalApiClient.saveCosecConfig({
        baseUrl: baseUrl.trim(),
        username: username.trim(),
        ...(replacing ? { password } : {}),
      });
      setSavedConfig(saved);
      setPassword('');
      setSaveSuccess(true);
      setTestStatus('ok');
      setTestMessage(replacing ? 'Configuration saved with the new password.' : 'Configuration saved. The saved password was kept.');
      loadPreview();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setTestStatus('fail');
      setTestMessage(err?.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await externalApiClient.syncAll('2026-09');
      await refreshData();
      await loadPreview();
      setSyncMessage(
        `Successfully synced ${result.users.syncedCount} employee(s), ${result.daily.syncedRecords} daily attendance records (${result.daily.syncedPunches} punches) from COSEC. Mock data has been cleaned up!`,
      );
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err?.message || 'Unable to sync with server'}`);
    } finally {
      setSyncing(false);
    }
  };

  const connectionStatusBadge = savedConfig ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold bg-teal-50 text-teal-700 border border-teal-200">
      <Wifi className="w-3 h-3" />
      Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      <WifiOff className="w-3 h-3" />
      Not configured
    </span>
  );

  return (
    <div className="space-y-5">
      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-slate-800">COSEC Attendance Integration</h2>
              {connectionStatusBadge}
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Connect to your <strong>Matrix COSEC</strong> Time &amp; Attendance server to automatically import
              employee and monthly attendance data. Uses HTTP Basic Authentication.
            </p>
          </div>
        </div>
      </Card>

      {/* Credentials form */}
      <Card>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Connection Details
        </h3>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {loadError}
          </div>
        )}

        <div className="space-y-4">
          {/* Base URL */}
          <div>
            <label htmlFor="cosec-base-url" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Base URL <span className="text-red-500">*</span>
            </label>
            <input
              ref={baseUrlRef}
              id="cosec-base-url"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://192.168.1.1/cosec"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono placeholder:text-slate-300 placeholder:font-sans"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              The full URL of your COSEC server (without trailing slash). Example:{' '}
              <code className="font-mono text-slate-500">http://192.168.1.100/cosec</code>
            </p>
          </div>

          {/* Username + Password side by side on larger screens */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cosec-username" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                id="cosec-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                // The COSEC account, not this app's login: the browser must not fill in a saved sign-in.
                name="cosec-api-username"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              />
            </div>

            <div>
              <label htmlFor="cosec-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password {savedConfig?.passwordSet ? <span className="text-slate-400 font-normal text-[11px]">(leave blank to keep)</span> : <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <input
                  id="cosec-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  // Not dots: an empty box must not look like a filled-in password.
                  placeholder={savedConfig?.passwordSet ? 'Saved — type a new password to replace it' : 'Enter password'}
                  className="w-full text-sm px-3 py-2 pr-9 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  // "new-password": browsers don't fill in a saved password here, which would replace the COSEC password on Save.
                  name="cosec-api-password"
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {savedConfig?.passwordSet && !password && (
                <p className="text-[11px] text-teal-600 mt-1">A password is saved. Leave blank to keep it unchanged.</p>
              )}
              {savedConfig?.passwordSet && password && (
                <p className="text-[11px] text-amber-700 mt-1">This replaces the saved password when you save.</p>
              )}
            </div>
          </div>
        </div>

        {/* Test connection feedback */}
        {testStatus && testStatus !== 'testing' && (
          <div
            className={`mt-4 flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 border ${
              testStatus === 'ok'
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {testStatus === 'ok' ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            )}
            <span>{testMessage}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="mt-4 flex items-center gap-2 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-3 py-2.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Configuration saved successfully.
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className="gap-1.5"
          >
            {testStatus === 'testing' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            Test Connection
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Configuration
          </Button>
        </div>
      </Card>

      {/* Every-minute sync, run by the cosec-sync worker */}
      {savedConfig && <CosecAutoSyncCard />}

      {/* Live Data from COSEC */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-600" />
              Live COSEC Data &amp; Employee Sync
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pull real users and attendance from your Matrix COSEC server and sync directly into the system.
            </p>
            {previewError && (
              <p role="alert" className="mt-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 break-words">
                COSEC data could not be loaded: {previewError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadPreview}
              disabled={loadingPreview}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? 'animate-spin' : ''}`} />
              Refresh Preview
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="gap-1.5"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              Sync Live Employees &amp; Attendance
            </Button>
          </div>
        </div>

        {syncMessage && (
          <div
            className={`mb-4 flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 border ${
              syncMessage.startsWith('Successfully')
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {syncMessage}
          </div>
        )}

        {/* Preview Subtabs */}
        <div className="flex border-b border-slate-200 mb-4 gap-2">
          <button
            type="button"
            onClick={() => setPreviewTab('users')}
            className={`pb-2 text-xs font-semibold px-3 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              previewTab === 'users'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            COSEC Users ({previewUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('daily')}
            className={`pb-2 text-xs font-semibold px-3 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              previewTab === 'daily'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Daily Punches &amp; Attendance ({previewDaily.length})
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('monthly')}
            className={`pb-2 text-xs font-semibold px-3 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              previewTab === 'monthly'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Monthly Attendance ({previewAttendance.length})
          </button>
        </div>

        {/* Preview Content */}
        <div className="space-y-4">
          {previewTab === 'users' && (
            <div>
              {previewUsers.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-3 text-center">
                  {loadingPreview ? 'Loading users from COSEC...' : 'No users loaded yet. Click "Refresh Preview" or "Sync Live Employees".'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100 max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">User ID / Code</th>
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Department</th>
                        <th className="text-left px-3 py-2">Designation</th>
                        <th className="text-left px-3 py-2">Branch</th>
                        <th className="text-left px-3 py-2">Joining Date</th>
                        <th className="text-left px-3 py-2">Contact</th>
                        <th className="text-left px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewUsers.map((u) => (
                        <tr key={u.cosecUserId} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-mono font-semibold text-teal-700">{u.cosecUserId}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700">{u.name}</td>
                          <td className="px-3 py-2 text-slate-600">{u.department || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{u.designation || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{u.branch || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{u.joinDate || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 text-[11px]">{u.mobile || u.email || '—'}</td>
                          <td className="px-3 py-2">
                            <Badge variant={u.active ? 'success' : 'neutral'} size="sm">
                              {u.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {previewTab === 'daily' && (
            <div>
              {previewDaily.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-3 text-center">
                  {loadingPreview ? 'Loading daily punches...' : 'No daily punches loaded yet. Click "Refresh Preview".'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100 max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">User ID</th>
                        <th className="text-left px-3 py-2">Employee Name</th>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">First Check-In</th>
                        <th className="text-left px-3 py-2">Current Presence</th>
                        <th className="text-left px-3 py-2">Punch Sequence</th>
                        <th className="text-left px-3 py-2">Worked Time</th>
                        <th className="text-left px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewDaily.map((d, idx) => (
                        <tr key={`${d.cosecUserId}-${d.date}-${idx}`} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-mono font-semibold text-teal-700">{d.cosecUserId}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700">{d.employeeName}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{d.date}</td>
                          <td className="px-3 py-2">
                            {d.firstCheckInTime ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                <Clock className="w-3 h-3 text-emerald-600" />
                                {d.firstCheckInTime}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono text-[11px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {d.isCurrentlyInside ? (
                              <span
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 cursor-help"
                                title={`Last COSEC device punch was ${d.rawOutPunchTime || d.punches[d.punches.length - 1]?.time} (Punch #${d.outPunchMatchedIndex || d.punches.length} - Check-IN). Employee is currently inside the office.`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Currently Inside
                              </span>
                            ) : d.lastCheckOutTime ? (
                              <span
                                className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 cursor-help"
                                title={`Last COSEC device punch was ${d.rawOutPunchTime || d.lastCheckOutTime} (Punch #${d.outPunchMatchedIndex || 'even'} - Check-OUT). Employee has checked out.`}
                              >
                                <Clock className="w-3 h-3 text-slate-500" />
                                Out ({d.lastCheckOutTime})
                              </span>
                            ) : d.firstCheckInTime ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                On Shift
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Not Punched</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {d.punches && d.punches.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {d.punches.map((p) => (
                                  <span
                                    key={`${p.index}-${p.time}`}
                                    className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                      p.type === 'CHECK_IN'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-blue-50 text-blue-800 border-blue-200'
                                    }`}
                                    title={`Punch ${p.index}: ${p.label}`}
                                  >
                                    <span className="font-bold">{p.type === 'CHECK_IN' ? 'IN' : 'OUT'}:</span>
                                    {p.time}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300 font-mono text-[11px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-700">
                            {d.workTimeHhmm && d.workTimeHhmm !== '00:00'
                              ? d.workTimeHhmm
                              : d.workedMinutes > 0
                              ? `${Math.floor(d.workedMinutes / 60)}h ${d.workedMinutes % 60}m`
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                d.status === 'PRESENT'
                                  ? 'success'
                                  : d.status === 'HALF_DAY'
                                  ? 'warning'
                                  : d.status === 'ABSENT'
                                  ? 'danger'
                                  : 'neutral'
                              }
                              size="sm"
                            >
                              {d.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {previewTab === 'monthly' && (
            <div>
              {previewAttendance.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-3 text-center">
                  {loadingPreview ? 'Loading monthly records...' : 'No monthly attendance loaded yet.'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100 max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">User ID</th>
                        <th className="text-left px-3 py-2">Employee Name</th>
                        <th className="text-right px-3 py-2">Present Days</th>
                        <th className="text-right px-3 py-2">Absent Days</th>
                        <th className="text-right px-3 py-2">Payable Days</th>
                        <th className="text-right px-3 py-2">Loss of Pay</th>
                        <th className="text-right px-3 py-2">Worked Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewAttendance.map((a) => (
                        <tr key={a.cosecUserId} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-mono font-semibold text-teal-700">{a.cosecUserId}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700">{a.employeeName}</td>
                          <td className="px-3 py-2 text-right font-semibold text-teal-600">{a.presentDays}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-500">{a.absentDays}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">{a.payableDays}</td>
                          <td className="px-3 py-2 text-right font-semibold text-amber-600">{a.lossOfPayDays}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">
                            {a.workedMinutes ? `${(a.workedMinutes / 60).toFixed(1)}h` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* How it works info */}
      <Card>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          How data is fetched
        </h3>
        <ul className="space-y-2.5">
          {[
            {
              label: 'Users',
              desc: 'GET /api.svc/v2/user?action=get;range=all;format=json',
              note: 'Fetches all active COSEC users. Matched to employees by Reference Code.',
            },
            {
              label: 'Monthly Attendance',
              desc: 'GET /api.svc/v2/attendance-monthly?action=get;range=all;month-year=MMYYYY;format=json',
              note: 'Returns present days, absent days, leave days, worked hours, overtime, and late minutes per employee.',
            },
          ].map(({ label, desc, note }) => (
            <li key={label} className="flex flex-col gap-1 p-3 bg-slate-50 rounded-xl">
              <span className="text-xs font-semibold text-slate-700">{label}</span>
              <code className="text-[10px] font-mono text-teal-700 break-all">{desc}</code>
              <p className="text-[11px] text-slate-400 leading-relaxed">{note}</p>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-400 mt-3">
          All API calls are made <strong>server-side only</strong>. Credentials are never exposed to the browser.
        </p>
      </Card>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────── */

export const ComplianceSettingsView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('compliance');
  const [pfCeiling, setPfCeiling] = useState(true);
  const [esicEnabled, setEsicEnabled] = useState(true);
  const [ptEnabled, setPtEnabled] = useState(true);
  const [tdsEnabled, setTdsEnabled] = useState(true);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'compliance',  label: 'Compliance',        icon: Shield },
    { id: 'components',  label: 'Salary Components', icon: IndianRupee },
    { id: 'org',         label: 'Organisation',       icon: Building2 },
    { id: 'api-config',  label: 'API Config',         icon: Link2 },
  ];

  const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; label: string; desc: string }> = ({ value, onChange, label, desc }) => (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 shrink-0 ${value ? 'bg-teal-500' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Compliance configuration, salary components, and integrations</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
              tab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Compliance tab ── */}
      {tab === 'compliance' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Statutory Deduction Settings</h2>
            <Toggle
              value={pfCeiling}
              onChange={setPfCeiling}
              label="PF Wage Ceiling (₹15,000)"
              desc="Cap EPF contribution on ₹15,000 basic instead of actual basic salary."
            />
            <Toggle
              value={esicEnabled}
              onChange={setEsicEnabled}
              label="ESIC Applicable"
              desc="Apply ESIC for employees with gross ≤ ₹21,000/month. Employee 0.75%, Employer 3.25%."
            />
            <Toggle
              value={ptEnabled}
              onChange={setPtEnabled}
              label="Professional Tax"
              desc="Deduct PT as per state slab (Maharashtra, Karnataka, Gujarat, etc.)."
            />
            <Toggle
              value={tdsEnabled}
              onChange={setTdsEnabled}
              label="TDS Deduction"
              desc="Compute and deduct TDS (Section 192) based on employee's declared tax regime."
            />
            <div className="mt-4">
              <Button variant="primary" size="sm">Save Settings</Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Upcoming Compliance Dues</h2>
            <ul className="space-y-3">
              {MOCK_COMPLIANCE.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                  {item.status === 'PAID' ? (
                    <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${item.status === 'OVERDUE' ? 'text-red-500' : 'text-amber-500'}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{item.title}</p>
                    <p className="text-[10px] text-slate-400">{item.period} · Due {item.dueDate}</p>
                    {item.amount && <p className="text-[10px] text-slate-500 mt-0.5">{fmt(item.amount)}</p>}
                  </div>
                  <Badge variant={STATUS_BADGE[item.status]} size="sm">{item.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ── Salary components tab ── */}
      {tab === 'components' && (
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Salary Components</h2>
            <Button variant="secondary" size="sm" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Add Component
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Salary components">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Code', 'Name', 'Type', 'Value / Formula', 'Taxable', 'Statutory'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {SALARY_COMPONENTS.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-teal-700">{c.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{c.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={TYPE_BADGE[c.type]} size="sm">{c.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{c.value}</td>
                    <td className="px-4 py-3">
                      {c.taxable
                        ? <CheckCircle2 className="w-4 h-4 text-teal-500" />
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.statutory
                        ? <Badge variant="warning" size="sm">Statutory</Badge>
                        : <span className="text-slate-300 text-[10px]">Custom</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Organisation tab ── */}
      {tab === 'org' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Company Information</h2>
            <div className="space-y-3">
              {[
                { label: 'Company Name', value: 'RND Technosoft Pvt Ltd' },
                { label: 'PAN (Company)', value: 'AAACR1234E' },
                { label: 'TAN', value: 'MUMR12345F' },
                { label: 'EPFO Code', value: 'MH/BAN/0012345' },
                { label: 'ESIC Code', value: '31-00-012345-000' },
                { label: 'State', value: 'Maharashtra' },
                { label: 'Payroll Period', value: '1st – Last of month' },
                { label: 'Payment Day', value: 'Last working day' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-slate-50 last:border-0 text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-700 text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Edit Organisation
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Financial Year</h2>
            <p className="text-xs text-slate-500 mb-3">Indian financial year runs April to March.</p>
            {[
              { label: 'Current FY', value: '2026–27' },
              { label: 'FY Start', value: '1 April 2026' },
              { label: 'FY End', value: '31 March 2027' },
              { label: 'TDS Deadline', value: '31 July 2027 (ITR)' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-50 last:border-0 text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-slate-700">{value}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ── API Configuration tab ── */}
      {tab === 'api-config' && <ApiConfigTab />}
    </div>
  );
};
