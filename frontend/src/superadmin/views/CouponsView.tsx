import React, { useCallback, useEffect, useState } from 'react';
import { Coupon, platformGovernanceApi } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyRow, LoadingRows, TableShell } from '../components/TableShell';
import { fieldClass, labelClass, primaryButtonClass } from '../components/form-styles';
import { formatDate } from '../format';

const EMPTY_FORM = { couponCode: '', discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED', discountValue: '', maxUses: '', validUntil: '' };

/** Platform coupons. Redemptions are counted by the server; nothing here is simulated. */
export const CouponsView: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoupons(await platformGovernanceApi.coupons());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coupons.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Enter a discount greater than zero.');
      return;
    }
    setIsSaving(true);
    try {
      const created = await platformGovernanceApi.createCoupon({
        couponCode: form.couponCode.trim(),
        discountType: form.discountType,
        discountValue: value,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        validUntil: form.validUntil || undefined,
      });
      setNotice(`Coupon ${created.code} created.`);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The coupon could not be created.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <Panel title="New coupon" description="Codes are unique. A percentage discount can be at most 100.">
        <form onSubmit={(event) => void submit(event)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end" noValidate>
          <div>
            <label htmlFor="coupon-code" className={labelClass}>Code</label>
            <input id="coupon-code" required value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} className={fieldClass} placeholder="LAUNCH20" />
          </div>
          <div>
            <label htmlFor="coupon-type" className={labelClass}>Discount type</label>
            <select id="coupon-type" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as 'PERCENTAGE' | 'FIXED' })} className={fieldClass}>
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED">Fixed amount</option>
            </select>
          </div>
          <div>
            <label htmlFor="coupon-value" className={labelClass}>{form.discountType === 'PERCENTAGE' ? 'Discount (%)' : 'Discount amount'}</label>
            <input id="coupon-value" required inputMode="decimal" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="coupon-uses" className={labelClass}>Maximum uses <span className="font-normal">(optional)</span></label>
            <input id="coupon-uses" inputMode="numeric" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="coupon-until" className={labelClass}>Valid until <span className="font-normal">(optional)</span></label>
            <input id="coupon-until" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={fieldClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={isSaving || !form.couponCode || !form.discountValue} className={primaryButtonClass}>
              {isSaving ? 'Creating…' : 'Create coupon'}
            </button>
            {formError && <p role="alert" className="text-xs text-hq-danger">{formError}</p>}
            {notice && <p role="status" className="text-xs text-hq-success">{notice}</p>}
          </div>
        </form>
      </Panel>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <TableShell caption="Coupons" columns={[{ label: 'Code' }, { label: 'Discount', align: 'right' }, { label: 'Used' }, { label: 'Valid' }, { label: 'Status' }]}>
        {!coupons && <LoadingRows columns={5} />}
        {coupons && coupons.length === 0 && <EmptyRow columns={5} title="No coupons" detail="Coupons you create appear here." />}
        {coupons?.map((coupon) => (
          <tr key={coupon.id}>
            <td className="py-3 px-4 font-mono font-semibold text-hq-foreground">{coupon.code}</td>
            <td className="py-3 px-4 text-right tabular-nums text-hq-foreground">
              {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : coupon.discountValue}
            </td>
            <td className="py-3 px-4 text-hq-foreground/90 tabular-nums">
              {coupon.usedCount}
              {coupon.maxUses !== null ? ` of ${coupon.maxUses}` : ' · no limit'}
            </td>
            <td className="py-3 px-4 text-hq-foreground/90">
              {formatDate(coupon.validFrom)} – {formatDate(coupon.validUntil) ?? 'no end date'}
            </td>
            <td className="py-3 px-4">
              <StatusBadge status={coupon.isActive ? 'ACTIVE' : 'DISABLED'} />
            </td>
          </tr>
        ))}
      </TableShell>
    </section>
  );
};
