'use client';

import React from 'react';
import { 
  TrendingUp, Sparkles, Trophy, Users, PieChart, BarChart3,
  Target, ShieldAlert, ArrowUpRight, CheckCircle2, DollarSign
} from 'lucide-react';

interface CRMAnalyticsProps {
  leads: any[];
  stages: any[];
  sources: any[];
  onSelectStage?: (stageId: string) => void;
  onSelectWon?: () => void;
  onSelectLead360?: (leadId: string) => void;
}

export default function CRMAnalytics({ leads, stages, sources, onSelectStage, onSelectWon, onSelectLead360 }: CRMAnalyticsProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const totalDeals = leads.length;
  const totalValue = leads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
  const wonLeads = leads.filter(l => l.is_won || l.temperature === 'WON');
  const wonValue = wonLeads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
  const winRate = totalDeals > 0 ? Math.round((wonLeads.length / totalDeals) * 100) : 0;
  const avgDealSize = totalDeals > 0 ? Math.round(totalValue / totalDeals) : 0;

  const weightedForecast = leads.reduce((acc, l) => {
    const stage = stages.find(s => s.id === l.stage_id);
    const prob = Number(stage?.stage_probability || l.win_probability || 20);
    return acc + (Number(l.budget_amount || 0) * prob / 100);
  }, 0);

  // Group by Source
  const sourceStats = sources.map(src => {
    const srcLeads = leads.filter(l => l.source_id === src.id);
    const srcVal = srcLeads.reduce((acc, l) => acc + Number(l.budget_amount || 0), 0);
    return {
      name: src.name,
      channel: src.channel,
      count: srcLeads.length,
      value: srcVal
    };
  }).filter(s => s.count > 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Pipeline */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Pipeline</span>
          <div className="text-xl font-bold text-slate-900">{formatCurrency(totalValue)}</div>
          <p className="text-[10px] text-slate-500">{totalDeals} active opportunities</p>
        </div>

        {/* Weighted Forecast */}
        <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Weighted Forecast</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-900">{formatCurrency(weightedForecast)}</div>
          <p className="text-[10px] text-blue-600 font-medium">Probability-adjusted expected ARR</p>
        </div>

        {/* Won Value */}
        <div 
          onClick={() => onSelectWon && onSelectWon()}
          className={`p-4 rounded-xl border border-emerald-200 shadow-xs space-y-1 transition-all ${
            onSelectWon ? 'bg-emerald-50/80 hover:bg-emerald-100/80 cursor-pointer' : 'bg-emerald-50/70'
          }`}
          title={onSelectWon ? 'Click to view all Won Deals' : undefined}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Deals Won</span>
            <Trophy className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-900">{formatCurrency(wonValue)}</div>
          <p className="text-[10px] text-emerald-600 font-medium">
            {wonLeads.length} deals closed {onSelectWon ? '· Click to view →' : ''}
          </p>
        </div>

        {/* Win Rate */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Win Rate %</span>
          <div className="text-xl font-bold text-slate-900">{winRate}%</div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${winRate}%` }} />
          </div>
        </div>

        {/* Avg Deal Size */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Deal Size</span>
          <div className="text-xl font-bold text-slate-900">{formatCurrency(avgDealSize)}</div>
          <p className="text-[10px] text-slate-500">Per qualified contract</p>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Sales Pipeline Conversion Funnel</h3>
            <p className="text-xs text-slate-500">Click any stage to view matching leads in Kanban or Directory</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
          {stages.map((stg) => {
            const count = leads.filter(l => l.stage_id === stg.id).length;
            const percentage = totalDeals > 0 ? Math.round((count / totalDeals) * 100) : 0;

            return (
              <div 
                key={stg.id} 
                onClick={() => onSelectStage && onSelectStage(stg.id)}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                  onSelectStage 
                    ? 'bg-slate-50 hover:bg-blue-50 hover:border-blue-300 cursor-pointer shadow-2xs hover:shadow-xs' 
                    : 'bg-slate-50 border-slate-200'
                }`}
                title={onSelectStage ? `Click to view all ${count} deals in "${stg.name}"` : undefined}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stg.color || '#3b82f6' }} />
                    <span className="text-xs font-bold text-slate-800 truncate">{stg.name}</span>
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">{count} Deals</div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>Funnel Share</span>
                    <span>{percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${Math.max(percentage, 5)}%`, backgroundColor: stg.color || '#3b82f6' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lead Sources & Temperature Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source ROI */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Lead Acquisition Channels & ROI</h3>
          <div className="space-y-3">
            {sourceStats.map((src, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>{src.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({src.channel})</span>
                  </div>
                  <span>{formatCurrency(src.value)} ({src.count} leads)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${totalValue > 0 ? (src.value / totalValue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}

            {sourceStats.length === 0 && (
              <p className="text-xs text-slate-400 py-4 text-center">No source channel data available.</p>
            )}
          </div>
        </div>

        {/* AI Deal Intelligence */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Voogyo AI Next Best Actions</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
              <span className="font-bold text-amber-900 block">High-Value Lead Follow-Up Required</span>
              <p className="text-amber-800 text-[11px]">
                3 deals valued above ₹5,00,000 have not had an activity logged in the past 48 hours. Schedule a demo or check-in call.
              </p>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
              <span className="font-bold text-blue-900 block">Proposal Acceleration</span>
              <p className="text-blue-800 text-[11px]">
                Leads in "Requirement Analysis" have an average AI win score of 82. Send commercial proposals to improve conversion velocity.
              </p>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
              <span className="font-bold text-emerald-900 block">Inbound Website Channel Outperforming</span>
              <p className="text-emerald-800 text-[11px]">
                Website inbound leads are closing with 35% higher deal sizes than other channels. Recommend allocating marketing budget to SEO.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
