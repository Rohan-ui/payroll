import React, { useEffect, useState } from 'react';
import { Branding, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { fieldClass, labelClass, primaryButtonClass } from '../components/form-styles';
import { formatDateTime } from '../format';
import { SmtpSettingsPanel } from './SmtpSettingsPanel';

/** Platform branding and outgoing email. */
export const GlobalSettingsView: React.FC = () => (
  <div className="space-y-5">
    <BrandingPanel />
    <SmtpSettingsPanel />
  </div>
);

/** Platform branding: name, support contact, website and default currency. Checked again on the server. */
const BrandingPanel: React.FC = () => {
  const [saved, setSaved] = useState<Branding | null>(null);
  const [form, setForm] = useState({ platformName: '', supportEmail: '', websiteUrl: '', currency: 'INR' });
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const apply = (branding: Branding) => {
    setSaved(branding);
    setForm({
      platformName: branding.platformName ?? '',
      supportEmail: branding.supportEmail ?? '',
      websiteUrl: branding.websiteUrl ?? '',
      currency: branding.currency ?? 'INR',
    });
  };

  useEffect(() => {
    platformGovernanceApi
      .branding()
      .then(apply)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings.'));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      apply(
        await platformGovernanceApi.saveBranding({
          platformName: form.platformName.trim(),
          supportEmail: form.supportEmail.trim() || undefined,
          websiteUrl: form.websiteUrl.trim() || undefined,
          currency: form.currency.trim(),
        }),
      );
      setNotice('Settings saved.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Settings could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  if (error) return <ErrorBanner message={error} />;
  if (!saved) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  return (
    <Panel title="Platform branding" description={saved.updatedAt ? `Last saved ${formatDateTime(saved.updatedAt)}.` : 'Not saved yet.'}>
      <form onSubmit={(event) => void submit(event)} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl" noValidate>
        <div>
          <label htmlFor="brand-name" className={labelClass}>Platform name</label>
          <input id="brand-name" required value={form.platformName} onChange={(e) => setForm({ ...form, platformName: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="brand-currency" className={labelClass}>Default currency (ISO code)</label>
          <input id="brand-currency" required maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="brand-email" className={labelClass}>Support email <span className="font-normal">(optional)</span></label>
          <input id="brand-email" type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="brand-website" className={labelClass}>Website <span className="font-normal">(optional, https://)</span></label>
          <input id="brand-website" type="url" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} className={fieldClass} />
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isSaving || form.platformName.trim().length < 2} className={primaryButtonClass}>
            {isSaving ? 'Saving…' : 'Save settings'}
          </button>
          {formError && <p role="alert" className="text-xs text-hq-danger">{formError}</p>}
          {notice && <p role="status" className="text-xs text-hq-success">{notice}</p>}
        </div>
      </form>
    </Panel>
  );
};
