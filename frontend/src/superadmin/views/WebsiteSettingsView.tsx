import React, { useEffect, useState } from 'react';
import { platformGovernanceApi, WebsiteSettings } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { fieldClass, labelClass, primaryButtonClass } from '../components/form-styles';
import { formatDateTime } from '../format';

type Fields = Omit<WebsiteSettings, 'updatedAt'>;

const FIELDS: { key: keyof Fields; label: string; hint?: string; long?: boolean; max: number }[] = [
  { key: 'hero_title', label: 'Headline', max: 200 },
  { key: 'hero_subtitle', label: 'Sub-headline', max: 400, long: true },
  { key: 'contact_email', label: 'Contact email', max: 320 },
  { key: 'contact_phone', label: 'Contact phone', max: 32 },
  { key: 'brand_color', label: 'Brand colour', hint: 'A hex colour such as #4663C4', max: 7 },
  { key: 'seo_meta_title', label: 'SEO title', hint: 'Up to 70 characters', max: 70 },
  { key: 'seo_meta_description', label: 'SEO description', hint: 'Up to 170 characters', max: 170, long: true },
];

const toForm = (settings: WebsiteSettings): Record<keyof Fields, string> =>
  Object.fromEntries(FIELDS.map(({ key }) => [key, settings[key] ?? ''])) as Record<keyof Fields, string>;

/** The public website's copy and SEO fields. Empty fields are saved as not set, never filled with samples. */
export const WebsiteSettingsView: React.FC = () => {
  const [saved, setSaved] = useState<WebsiteSettings | null>(null);
  const [form, setForm] = useState<Record<keyof Fields, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    platformGovernanceApi
      .website()
      .then((settings) => {
        setSaved(settings);
        setForm(toForm(settings));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load website settings.'));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const payload = Object.fromEntries(FIELDS.map(({ key }) => [key, form[key].trim() || null])) as Fields;
      const next = await platformGovernanceApi.saveWebsite(payload);
      setSaved(next);
      setForm(toForm(next));
      setNotice('Website settings saved.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Website settings could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  if (error) return <ErrorBanner message={error} />;
  if (!form || !saved) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  return (
    <Panel title="Website copy and SEO" description={saved.updatedAt ? `Last saved ${formatDateTime(saved.updatedAt)}.` : 'Nothing saved yet: every field is empty until you fill it in.'}>
      <form onSubmit={(event) => void submit(event)} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl" noValidate>
        {FIELDS.map((field) => (
          <div key={field.key} className={field.long ? 'md:col-span-2' : undefined}>
            <label htmlFor={`website-${field.key}`} className={labelClass}>
              {field.label} <span className="font-normal">(optional{field.hint ? ` · ${field.hint}` : ''})</span>
            </label>
            {field.long ? (
              <textarea
                id={`website-${field.key}`}
                rows={2}
                maxLength={field.max}
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                className={`${fieldClass} h-auto py-2`}
              />
            ) : (
              <input
                id={`website-${field.key}`}
                maxLength={field.max}
                value={form[field.key]}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                className={fieldClass}
              />
            )}
          </div>
        ))}
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? 'Saving…' : 'Save website settings'}
          </button>
          {formError && <p role="alert" className="text-xs text-hq-danger">{formError}</p>}
          {notice && <p role="status" className="text-xs text-hq-success">{notice}</p>}
        </div>
      </form>
    </Panel>
  );
};
