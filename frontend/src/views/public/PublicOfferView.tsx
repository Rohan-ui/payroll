import React, { useEffect, useId, useRef, useState } from 'react';
import { publicOfferApi, type PublicOffer } from '../../api/public-offer.api';
import { PdfViewer } from '../../components/ui/PdfViewer';

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const amount = (value: string) => rupees.format(Number(value));
const date = (isoDate: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));

const CLOSED: Record<string, string> = {
  ACCEPTED: 'You accepted this offer. Thank you — we will be in touch about the next steps.',
  DECLINED: 'You declined this offer. Thank you for letting us know.',
  EXPIRED: 'This offer has expired. Please contact us if you are still interested.',
  WITHDRAWN: 'This offer has been withdrawn. Please contact us if you have questions.',
};

/**
 * The page a candidate opens from their offer email. No sign-in: the link's
 * token is the only key, and the page shows only their own offer.
 */
export const PublicOfferView: React.FC<{ token: string }> = ({ token }) => {
  const ids = useId();
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typedName, setTypedName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    // The link carries the token: keep it out of requests to other sites.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    document.title = 'Your offer';
    publicOfferApi.view(token).then(setOffer).catch((e: Error) => setError(e.message));
    return () => meta.remove();
  }, [token]);

  const respond = async (run: () => Promise<PublicOffer>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      setOffer(await run());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        {error ? (
          <div role="alert" className="p-6 rounded-2xl border border-red-200 bg-white text-center">
            <h1 className="text-lg font-bold">This link can't be opened</h1>
            <p className="mt-2 text-sm text-slate-600">{error} If you think this is a mistake, reply to the email you received.</p>
          </div>
        ) : !offer ? (
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading your offer</span></div>
        ) : (
          <>
            <header>
              <p className="text-sm font-semibold text-teal-700">{offer.companyName}</p>
              <h1 className="text-2xl font-bold">Your offer: {offer.jobTitle}</h1>
              <p className="text-sm text-slate-600">For {offer.candidateName} · Reference {offer.offerCode}</p>
            </header>

            {!offer.canRespond && CLOSED[offer.status] && (
              <p role="status" className="p-4 rounded-2xl border border-teal-200 bg-teal-50 text-sm text-teal-900">{CLOSED[offer.status]}</p>
            )}

            <section aria-labelledby={`${ids}-summary`} className="p-5 rounded-2xl border border-slate-200 bg-white">
              <h2 id={`${ids}-summary`} className="text-sm font-bold">Summary</h2>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div><dt className="text-slate-500">Joining date</dt><dd className="font-semibold">{date(offer.joiningDate)}</dd></div>
                <div><dt className="text-slate-500">Respond by</dt><dd className="font-semibold">{date(offer.expiresOn)}</dd></div>
                <div><dt className="text-slate-500">Total per year</dt><dd className="font-semibold">{amount(offer.annualCtc)}</dd></div>
              </dl>
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Pay per year</caption>
                <tbody>
                  {offer.components.map((c) => (
                    <tr key={c.label} className="border-t border-slate-100"><th scope="row" className="py-1.5 text-left font-normal text-slate-600">{c.label}</th><td className="py-1.5 text-right tabular-nums">{amount(c.annualAmount)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setViewing(true)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50">View the offer letter (PDF)</button>
                <a href={publicOfferApi.pdfDownloadUrl(token)} className="text-sm font-semibold text-teal-700 underline" rel="noreferrer">Download it</a>
              </div>
            </section>

            <section aria-labelledby={`${ids}-letter`} className="p-5 rounded-2xl border border-slate-200 bg-white">
              <h2 id={`${ids}-letter`} className="font-bold">{offer.letter.title}</h2>
              <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{offer.letter.body}</p>
            </section>

            {offer.canRespond && (
              <section aria-labelledby={`${ids}-respond`} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
                <h2 id={`${ids}-respond`} className="font-bold">Your answer</h2>
                {actionError && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{actionError}</p>}
                {!declining ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!confirmed) return setActionError('Tick the box to confirm that you accept the offer.');
                      if (typedName.trim().length < 2) return setActionError('Type your full name to accept.');
                      respond(() => publicOfferApi.accept(token, typedName.trim()));
                    }}
                  >
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                      <span>I have read the offer letter and I accept this offer.</span>
                    </label>
                    <div>
                      <label htmlFor={`${ids}-name`} className="block text-sm font-semibold mb-1">Type your full name *</label>
                      <input id={`${ids}-name`} value={typedName} onChange={(e) => setTypedName(e.target.value)} maxLength={200} autoComplete="name" className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      <p className="mt-1 text-xs text-slate-500">
                        Your typed name, the time and your device's details are recorded as your confirmation. This is not a verified digital signature.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Accept the offer'}</button>
                      <button type="button" onClick={() => { setDeclining(true); setActionError(null); }} className="px-5 py-2.5 rounded-xl border border-slate-300 font-semibold">Decline instead</button>
                    </div>
                  </form>
                ) : (
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); respond(() => publicOfferApi.decline(token, reason.trim() || undefined)); }}>
                    <p className="text-sm">Declining is final for this offer.</p>
                    <div>
                      <label htmlFor={`${ids}-reason`} className="block text-sm font-semibold mb-1">Would you like to tell us why? (optional)</label>
                      <textarea id={`${ids}-reason`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Decline the offer'}</button>
                      <button type="button" onClick={() => setDeclining(false)} className="px-5 py-2.5 rounded-xl border border-slate-300 font-semibold">Back</button>
                    </div>
                  </form>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {viewing && offer && (
        <PdfViewer
          title={`Offer letter ${offer.offerCode}`}
          description={`${offer.companyName} · ${offer.jobTitle}`}
          load={() => publicOfferApi.pdf(token)}
          downloadName={`${offer.offerCode}.pdf`}
          onClose={() => setViewing(false)}
        />
      )}
    </main>
  );
};
