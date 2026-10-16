import React, { useCallback, useEffect, useId, useState } from 'react';
import { apiClient } from '../../api/client';
import { fetchFile } from '../../api/onboarding.api';
import { PdfViewer } from '../ui/PdfViewer';

interface QuotationTemplate { id: string; name: string; versionNumber: number }

/**
 * A quotation as its PDF, in the in-app viewer with Download. It prints with
 * an approved quotation template from Organization & Settings → Documents &
 * letterheads (chosen here when there are several), or the standard wording
 * until one is approved. The server fills in the stored amounts.
 */
export const QuotationPdfViewer: React.FC<{ quotationId: string; quotationNumber: string; client?: string; onClose: () => void }> = ({ quotationId, quotationNumber, client, onClose }) => {
  const id = useId();
  const [templates, setTemplates] = useState<QuotationTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');

  useEffect(() => {
    let live = true;
    apiClient.get<{ success: boolean; data: QuotationTemplate[] }>('/crm/quotations/document-templates')
      .then((r) => { if (live) { setTemplates(r.data); setTemplateId(r.data[0]?.id ?? ''); } })
      // Without the list, the server's own choice is used.
      .catch(() => { if (live) setTemplates([]); });
    return () => { live = false; };
  }, []);

  const load = useCallback(
    () => fetchFile(`/api/v1/crm/quotations/${quotationId}/pdf${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ''}`),
    [quotationId, templateId],
  );

  // The PDF is asked for once it is known which template to print with.
  if (templates === null) return null;
  return (
    <PdfViewer
      key={templateId}
      title={`Quotation ${quotationNumber}`}
      description={client}
      load={load}
      downloadName={`${quotationNumber}.pdf`}
      notice={templates.length ? undefined : 'Printed with the standard quotation wording. To use your own wording and letterhead, approve a quotation template in Organization & Settings → Documents & letterheads.'}
      controls={templates.length > 1 ? (
        <span className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-template`} className="text-xs font-semibold text-slate-600">Template</label>
          <select id={`${id}-template`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.versionNumber})</option>)}
          </select>
        </span>
      ) : undefined}
      onClose={onClose}
    />
  );
};
