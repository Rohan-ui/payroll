import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { offboardingApi, NOTIFICATION_EVENTS, type NotificationEvent, type NotificationSettings } from '../../api/offboarding.api';
import { errorText } from '../payroll/payroll-format';

/** Which exit events send emails in this workspace. */
export const EmailSettingsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { offboardingApi.notificationSettings().then(setSettings).catch((e) => setError(errorText(e))); }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await offboardingApi.saveNotificationSettings(settings);
      toast.success('Email settings saved');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Exit emails" description="Emails go to the person leaving, their manager, and the people whose role covers the step. Whoever takes an action isn’t emailed about it." size="sm"
      onClose={() => !saving && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving} disabled={saving || !settings}>Save</Button></>}>
      {!settings && !error && <p role="status" className="text-sm text-slate-500">Loading…</p>}
      {settings && (
        <fieldset>
          <legend className="sr-only">Send an email when</legend>
          <ul className="space-y-2">
            {(Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[]).map((event) => (
              <li key={event}>
                <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500" checked={settings[event]}
                    onChange={(e) => setSettings({ ...settings, [event]: e.target.checked })} />
                  {NOTIFICATION_EVENTS[event]}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
