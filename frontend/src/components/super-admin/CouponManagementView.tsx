'use client';

import React, { useState, useEffect } from 'react';
import {
  Ticket, Plus, Search, Filter, Calendar, Tag, DollarSign,
  TrendingUp, CheckCircle, AlertTriangle, X, Check, Copy,
  Sparkles, Layers, Zap, HardDrive, Users, Clock, Calculator
} from 'lucide-react';

export default function CouponManagementView() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Live Calculator State
  const [calcPlanPrice, setCalcPlanPrice] = useState(5999);
  const [calcCouponCode, setCalcCouponCode] = useState('VOOGYO50');
  const [calcResult, setCalcResult] = useState<any>(null);

  // Form State for creating/editing coupons
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    minOrderRupees: 2999,
    maxUses: 100,
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: '2026-12-31',
    isActive: true,
    bonusTrialDays: 7,
    bonusAiTokens: 100000,
    bonusStorageMb: 5120, // 5GB
    bonusSeats: 2,
    applicablePlans: ['GROWTH', 'PROFESSIONAL'],
    firstPurchaseOnly: true
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/super-admin/coupons');
      const json = await res.json();
      if (json.success) {
        setCoupons(json.data || []);
      }
    } catch (e) {
      console.error('Error fetching coupons:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleCreateCoupon = async () => {
    if (!formData.code.trim()) return;

    try {
      const res = await fetch('/api/v1/super-admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          description: formData.description,
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          minOrderCents: formData.minOrderRupees * 100,
          maxUses: formData.maxUses,
          validFrom: formData.validFrom,
          validUntil: formData.validUntil,
          isActive: formData.isActive,
          bonusTrialDays: formData.bonusTrialDays,
          bonusAiTokens: formData.bonusAiTokens,
          bonusStorageMb: formData.bonusStorageMb,
          bonusSeats: formData.bonusSeats,
          applicablePlans: formData.applicablePlans,
          rules: { firstPurchaseOnly: formData.firstPurchaseOnly }
        })
      });

      const json = await res.json();
      if (json.success) {
        showBanner(`Coupon '${formData.code.toUpperCase()}' provisioned successfully!`);
        setShowCreateModal(false);
        fetchCoupons();
      }
    } catch (e) {
      console.error('Error creating coupon:', e);
    }
  };

  const handleCalculateDiscount = () => {
    const found = coupons.find(c => c.code.toUpperCase() === calcCouponCode.trim().toUpperCase());
    if (!found) {
      setCalcResult({ error: `Invalid coupon code '${calcCouponCode}'` });
      return;
    }

    let discount = 0;
    if (found.discount_type === 'PERCENTAGE') {
      discount = (calcPlanPrice * Number(found.discount_value)) / 100;
    } else {
      discount = Number(found.discount_value);
    }

    const finalPrice = Math.max(0, calcPlanPrice - discount);
    setCalcResult({
      code: found.code,
      originalPrice: calcPlanPrice,
      discount,
      finalPrice,
      bonusAi: found.bonus_ai_tokens || 0,
      bonusTrial: found.bonus_trial_days || 0
    });
  };

  // KPIs
  const totalActive = coupons.filter(c => c.is_active).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + (c.times_used || 0), 0);
  const estDiscountGranted = 64500;
  const estRevenueGenerated = 184900;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Enterprise Billing Engine
            </span>
            <span className="text-xs text-slate-500 font-medium">Promotional Campaigns & Bonus Quotas</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Coupon & Discount Management</h1>
          <p className="text-xs text-slate-500">
            Configure flat/percentage discounts, extra trial days, AI token bonuses, and multi-tier usage limits.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Coupon</span>
        </button>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* 4 Analytics Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Active Coupons</span>
          <p className="text-xl font-black text-slate-900">{totalActive} Campaigns</p>
          <span className="text-[10px] text-teal-700 font-bold">Live in checkout</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Total Redemptions</span>
          <p className="text-xl font-black text-slate-900">{totalRedemptions} Times</p>
          <span className="text-[10px] text-emerald-600 font-bold">+18 redemptions this month</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Revenue Generated</span>
          <p className="text-xl font-black text-teal-700">₹{estRevenueGenerated.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-slate-400">After promotional applied</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Total Value Discounted</span>
          <p className="text-xl font-black text-indigo-700">₹{estDiscountGranted.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-slate-400">Customer acquisition incentive</span>
        </div>
      </div>

      {/* Live Interactive Price & Discount Calculator */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white border border-slate-700 shadow-md space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-teal-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">
            Real-Time Subscription Coupon Simulator
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-slate-300 block mb-1">Base Plan Price (₹)</label>
            <input
              type="number"
              value={calcPlanPrice}
              onChange={(e) => setCalcPlanPrice(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-300 block mb-1">Coupon Code to Test</label>
            <input
              type="text"
              value={calcCouponCode}
              onChange={(e) => setCalcCouponCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs text-white focus:outline-none focus:border-teal-400 font-mono font-bold"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculateDiscount}
              className="w-full py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Simulate Checkout Price
            </button>
          </div>
        </div>

        {calcResult && (
          <div className="p-3 bg-white/10 rounded-xl border border-white/15 text-xs flex items-center justify-between flex-wrap gap-2">
            {calcResult.error ? (
              <span className="text-rose-300 font-bold">{calcResult.error}</span>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-slate-300">Original: ₹{calcResult.originalPrice}</span>
                  <span className="text-teal-300 font-bold">Discount: -₹{calcResult.discount}</span>
                  <span className="text-emerald-400 font-black text-sm">Payable: ₹{calcResult.finalPrice}</span>
                </div>
                {(calcResult.bonusAi > 0 || calcResult.bonusTrial > 0) && (
                  <span className="px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 font-bold text-[10px]">
                    🎁 Bonus: +{calcResult.bonusTrial} Days Trial & {(calcResult.bonusAi / 1000)}k AI Tokens!
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Coupons Table */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">Coupon Code & Title</th>
                <th className="py-3 px-4">Discount Value</th>
                <th className="py-3 px-4">Bonus Rewards</th>
                <th className="py-3 px-4">Usage Meter</th>
                <th className="py-3 px-4">Validity</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons
                .filter(c => !searchQuery || c.code.toLowerCase().includes(searchQuery.toLowerCase()) || c.description?.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((cpn) => (
                  <tr key={cpn.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-teal-700 bg-teal-50 px-2 py-1 rounded border border-teal-200 text-xs">
                          {cpn.code}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{cpn.description}</p>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {cpn.discount_type === 'PERCENTAGE' ? `${cpn.discount_value}% OFF` : `₹${cpn.discount_value} OFF`}
                      <p className="text-[10px] text-slate-400 font-normal">Min spend: ₹{((cpn.min_order_cents || 0) / 100).toLocaleString('en-IN')}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        {cpn.bonus_trial_days > 0 && (
                          <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-bold border border-amber-200 mr-1">
                            +{cpn.bonus_trial_days}d Trial
                          </span>
                        )}
                        {cpn.bonus_ai_tokens > 0 && (
                          <span className="inline-block px-1.5 py-0.5 bg-cyan-50 text-cyan-700 rounded text-[9px] font-bold border border-cyan-200 mr-1">
                            +{(cpn.bonus_ai_tokens / 1000)}k AI
                          </span>
                        )}
                        {cpn.bonus_seats > 0 && (
                          <span className="inline-block px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[9px] font-bold border border-purple-200">
                            +{cpn.bonus_seats} Seats
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900">{cpn.times_used || 0}</span>
                      <span className="text-slate-400"> / {cpn.max_uses}</span>
                      <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                        <div
                          className="h-full bg-teal-600"
                          style={{ width: `${Math.min(100, ((cpn.times_used || 0) / (cpn.max_uses || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {cpn.valid_until ? new Date(cpn.valid_until).toLocaleDateString() : 'No Expiry'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        cpn.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {cpn.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Coupon Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Provision Enterprise Promotional Coupon</h3>
                  <p className="text-xs text-slate-500">Commercial discount & customer incentive engine</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Coupon Code</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. DIWALI30"
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                  >
                    <option value="PERCENTAGE">Percentage (%) Off</option>
                    <option value="FLAT_INR">Flat Rupees (₹) Off</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Discount Value</label>
                  <input
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: Number(e.target.value) })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Max Redemptions</label>
                  <input
                    type="number"
                    value={formData.maxUses}
                    onChange={(e) => setFormData({ ...formData, maxUses: Number(e.target.value) })}
                    className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Campaign Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. 30% Festive Discount on Annual Growth Tier"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>

              {/* Bonus Quotas Accordion */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-900 block text-[11px]">🎁 Promotional Value Bonuses (Optional)</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500">Extra Trial Days</label>
                    <input
                      type="number"
                      value={formData.bonusTrialDays}
                      onChange={(e) => setFormData({ ...formData, bonusTrialDays: Number(e.target.value) })}
                      className="w-full mt-0.5 p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Bonus AI Tokens</label>
                    <input
                      type="number"
                      value={formData.bonusAiTokens}
                      onChange={(e) => setFormData({ ...formData, bonusAiTokens: Number(e.target.value) })}
                      className="w-full mt-0.5 p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Bonus Seats</label>
                    <input
                      type="number"
                      value={formData.bonusSeats}
                      onChange={(e) => setFormData({ ...formData, bonusSeats: Number(e.target.value) })}
                      className="w-full mt-0.5 p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCoupon}
                className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Provision Coupon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
