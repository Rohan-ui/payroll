import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Trophy } from 'lucide-react';
import { apiFetch } from '../../api/client';

interface WonDealsViewProps {
  onBack: () => void;
  onSelectLead360: (leadId: string) => void;
}

/** Won deals come from the server (won leads only), not from the leads already loaded on the board. */
const WON_LIMIT = 100;

const formatCurrency = (value: unknown, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value) || 0);

const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : null;

/**
 * Converted sales: every won lead with its contact, the client it was
 * converted to (if any), value, won date and owner, most recent win first.
 */
export default function WonDealsView({ onBack, onSelectLead360 }: WonDealsViewProps) {
  const [deals, setDeals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/crm/leads?isWon=true&page=1&limit=${WON_LIMIT}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || 'Won deals could not be loaded.');
        return;
      }
      const won = [...(json.data?.leads ?? [])].sort(
        (a, b) => new Date(b.closed_at ?? b.updated_at ?? 0).getTime() - new Date(a.closed_at ?? a.updated_at ?? 0).getTime(),
      );
      setDeals(won);
      setClients(json.data?.clients ?? []);
      setTotal(json.data?.pagination?.total ?? won.length);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clientName = (clientId: string | null) => {
    if (!clientId) return null;
    const client = clients.find((c) => c.id === clientId);
    return client ? `${client.company_name} (${client.client_code})` : 'Linked client';
  };

  return (
    <section className="space-y-3" aria-labelledby="won-deals-heading" aria-busy={loading}>
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to pipeline
          </button>
          <h2 id="won-deals-heading" className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Trophy className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            Won deals
            {!loading && !error && <span className="font-semibold text-slate-500">({total})</span>}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-bold underline">
            Try again
          </button>
        </div>
      )}

      {!error && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Won deals, most recent first</caption>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-3 px-4 font-bold">Company</th>
                <th scope="col" className="py-3 px-4 font-bold">Contact</th>
                <th scope="col" className="py-3 px-4 font-bold">Converted client</th>
                <th scope="col" className="py-3 px-4 font-bold text-right">Value</th>
                <th scope="col" className="py-3 px-4 font-bold">Won on</th>
                <th scope="col" className="py-3 px-4 font-bold">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && deals.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-slate-500" role="status">
                    Loading won deals…
                  </td>
                </tr>
              )}
              {!loading && deals.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-slate-500">
                    No won deals yet. When a deal is won (Deal Won, or moved to a Won stage) it appears here.
                  </td>
                </tr>
              )}
              {deals.map((deal) => (
                <tr key={deal.id} className="align-top">
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => onSelectLead360(deal.id)}
                      className="font-bold text-slate-900 hover:text-blue-700 hover:underline text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {deal.company_name}
                    </button>
                    <div className="font-mono text-[11px] text-slate-500">{deal.lead_code}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    <div>{[deal.first_name, deal.last_name].filter(Boolean).join(' ')}</div>
                    <div className="text-[11px] text-slate-500 break-all">{deal.email}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {clientName(deal.converted_client_id) ?? <span className="text-slate-400 italic">Not converted to a client</span>}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900">
                    {formatCurrency(deal.budget_amount, deal.currency_code || 'INR')}
                  </td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    {formatDate(deal.closed_at) ?? <span className="text-slate-400 italic">Not recorded</span>}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{deal.assigned_user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > deals.length && (
            <p className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
              Showing the {deals.length} most recently created of {total} won deals.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
