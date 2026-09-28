'use client';

import React, { useState } from 'react';
import {
  X, Sparkles, BookOpen, Layers, MessageSquare, Mail, Globe, Phone,
  Copy, Check, ChevronRight, Clock, Target, ShieldCheck, ArrowRight,
  TrendingUp, Building2, Flame, AlertCircle, FileText, CheckCircle2,
  Share2, ExternalLink
} from 'lucide-react';
import {
  CADENCE_STEPS_MASTER,
  CADENCE_REPLY_BRANCHES,
  CADENCE_INDUSTRIES,
  DEFAULT_PORTFOLIO_LINK
} from '@/lib/coldMarketingCadence';

interface SalesBibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName?: string;
}

export function SalesBibleModal({ isOpen, onClose, tenantName = 'RND Technosoft' }: SalesBibleModalProps) {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LAYER1_JOURNEY' | 'LAYER2_INDUSTRIES' | 'LAYER3_BRANCHES' | 'BDE_SOP'>('OVERVIEW');
  const [selectedIndustryKey, setSelectedIndustryKey] = useState<string>('manufacturing');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleCopyEntireSalesBibleMarkdown = () => {
    const markdown = `# ${tenantName} Sales Bible
## Smart Multi-Channel Cold Marketing Funnel (30 Days)
**${tenantName} Gold Funnel — WhatsApp + Email + LinkedIn + Phone**
*India B2B Outbound Strategy*

> **Rule:** Every follow-up uses 2 or 3 platforms together, but never repeats the same message. This creates familiarity instead of frustration.

### 8 Touchpoints, 3 Platforms, 1 Discovery Call
Target: Business Owners, Directors, Marketing Heads, Factory Owners, HR Heads.

| Day | Platforms Used | Goal | Role in Funnel |
|---|---|---|---|
| Day 1 | LinkedIn + Email + WhatsApp | Professional Introduction | LinkedIn: "I know this company" · Email: "This is a professional business" · WhatsApp: "Let's start a conversation" |
| Day 5 | WhatsApp + LinkedIn | Build Trust with Portfolio | WhatsApp: Share portfolio · LinkedIn: Like/Comment on recent post (No DM) |
| Day 10 | Email + WhatsApp | Share Valuable Insight | Email: Educational tip · WhatsApp: Teaser to boost email open rate |
| Day 15 | WhatsApp + LinkedIn | Offer Free Audit | WhatsApp: Free Digital Audit offer · LinkedIn: Educational industry post |
| Day 20 | Email + WhatsApp | Client Success Story | Email: Case study · WhatsApp: Short teaser |
| Day 25 | Phone + WhatsApp | Qualify Requirement | Phone: 2-minute qualification · WhatsApp: Post-call or Missed-call message |
| Day 30 | WhatsApp + Email + LinkedIn | Discovery Call or Respectful Exit | Respectful exit, zero guilt, leaves future opportunity open |

---
### Layer 1: Exact Outreach Templates
${CADENCE_STEPS_MASTER.map(step => `
#### DAY ${step.dayNumber}: ${step.title}
* **Goal:** ${step.goal}
* **Timing:** ${step.timingGuide}
* **Role Guidance:** ${step.roleNote}

${step.templates.email ? `**Email Subject:** ${step.templates.email.subject}\n\n**Email Body:**\n${step.templates.email.body}\n` : ''}
${step.templates.whatsapp ? `**WhatsApp Message:**\n${step.templates.whatsapp.message}\n` : ''}
${step.templates.linkedin?.message ? `**LinkedIn Message:**\n${step.templates.linkedin.message}\n` : ''}
${step.templates.linkedin?.actionNote ? `**LinkedIn Action Note:**\n${step.templates.linkedin.actionNote}\n` : ''}
${step.templates.phone ? `**Phone Pitch Script:**\n${step.templates.phone.pitchScript}\n\n**After Call Taken (WhatsApp):**\n${step.templates.phone.afterCallTakenWhatsApp}\n\n**Missed Call (WhatsApp):**\n${step.templates.phone.missedCallWhatsApp}\n` : ''}
`).join('\n---\n')}

---
### Layer 2: Industry-Specific Variations
${Object.values(CADENCE_INDUSTRIES).map(ind => `
* **${ind.name}**: ${ind.tagline}
  - Portfolio Angle: ${ind.portfolioHighlight}
  - Value Insight: ${ind.valueTip}
  - Free Audit Hook: ${ind.auditHook}
`).join('\n')}

---
### Layer 3: Reply-Based Branching Objection Playbook
${Object.values(CADENCE_REPLY_BRANCHES).map(branch => `
* **When Prospect Says: "${branch.label}"** (${branch.triggerCondition})
  - Next Lead Temperature: ${branch.nextLeadTemperature}
  - Suggested Action: ${branch.suggestedAction}
  - Recommended Script: ${branch.recommendedResponseScript}
  - WhatsApp Follow-Up: ${branch.whatsappMessage}
`).join('\n')}
`;

    handleCopy(markdown, 'full_bible');
  };

  const selectedIndustry = CADENCE_INDUSTRIES[selectedIndustryKey] || CADENCE_INDUSTRIES.manufacturing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* MODAL HEADER */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white border-b border-slate-800 relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 flex items-center gap-1 shadow-xs">
                  <Sparkles className="w-3 h-3 text-slate-950 fill-current" />
                  RND Gold Funnel
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/15">
                  India B2B Strategy
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  8 Touchpoints • 3 Platforms • 1 Discovery Call
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-amber-400" />
                <span>{tenantName} Sales Bible</span>
              </h1>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Smart Multi-Channel Cold Marketing SOP. Prospects experience {tenantName} across LinkedIn, Email, WhatsApp & Phone naturally without feeling spammed.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                onClick={handleCopyEntireSalesBibleMarkdown}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Copy entire Sales Bible as Markdown format for SOP notes"
              >
                {copiedKey === 'full_bible' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'full_bible' ? 'Copied Entire Bible!' : 'Copy Full Bible'}</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Golden Rule Banner */}
          <div className="mt-4 p-3 bg-amber-500/15 border border-amber-400/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-200">
            <span className="text-base shrink-0">💡</span>
            <div>
              <strong className="text-amber-100">Golden Law:</strong> Every follow-up uses 2 or 3 platforms together, but never repeats the same message. This creates <em>familiarity instead of frustration</em>.
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="px-5 py-2.5 bg-slate-100/90 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {[
            { id: 'OVERVIEW', label: 'Strategy & Psychology', icon: Sparkles },
            { id: 'LAYER1_JOURNEY', label: 'Layer 1: 30-Day Funnel (8 Touchpoints)', icon: Clock },
            { id: 'LAYER2_INDUSTRIES', label: 'Layer 2: Industry Playbooks', icon: Building2 },
            { id: 'LAYER3_BRANCHES', label: 'Layer 3: Reply-Based Branches', icon: Flame },
            { id: 'BDE_SOP', label: 'BDE Execution SOP & Rules', icon: ShieldCheck }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB CONTENTS */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-xs">
          
          {/* TAB 1: STRATEGY & PSYCHOLOGY OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6 animate-in fade-in">
              {/* The 3 Pillars Psychology Grid */}
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-600" />
                  <span>The Psychology Behind Multi-Channel Touchpoints</span>
                </h3>
                <p className="text-slate-500 text-xs mb-3">
                  Single-channel follow-up feels like nagging. Multi-channel presence feels like natural ubiquity and market authority.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-blue-900 text-sm">
                        <Globe className="w-4 h-4 text-blue-600" />
                        <span>LinkedIn</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Top of Mind</span>
                    </div>
                    <div className="text-base font-extrabold text-blue-950 font-serif italic">
                      &quot;I know this company.&quot;
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Builds professional authority. We connect, view profiles, and engage with content — establishing {tenantName} as an established peer in their feed without aggressive direct pitches.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-purple-900 text-sm">
                        <Mail className="w-4 h-4 text-purple-600" />
                        <span>Email</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">Credibility</span>
                    </div>
                    <div className="text-base font-extrabold text-purple-950 font-serif italic">
                      &quot;This is a professional business.&quot;
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Carries the formal message, portfolio, digital audit case study, and official company credentials. Sits permanently in their corporate inbox for internal forwarding to directors.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-sm">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>WhatsApp</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Conversation</span>
                    </div>
                    <div className="text-base font-extrabold text-emerald-950 font-serif italic">
                      &quot;Let&apos;s start a conversation.&quot;
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed">
                      Friendly, concise, and instant. Short teaser notifications that refer to the email, offer free audits, and provide zero-friction 1-tap replies.
                    </p>
                  </div>
                </div>
              </div>

              {/* The 3-Layer Architecture */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>The 3 Architecture Layers of the {tenantName} Sales Bible</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 uppercase">Layer 1</span>
                    <h4 className="font-bold text-slate-900 text-xs">The 30-Day Multi-Channel Cadence</h4>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      8 touchpoints orchestrated over 30 days (Day 1, 5, 10, 15, 20, 25, 30). Pre-engineered timing, combination of channels, and deliberate psychological progression.
                    </p>
                  </div>

                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">Layer 2</span>
                    <h4 className="font-bold text-slate-900 text-xs">Industry-Specific Customizations</h4>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Bespoke versions of all 8 messages for Manufacturing, Healthcare/Hospitals, Travel, Schools, Finance/CA, Chemical, Textile, Resorts, and more.
                    </p>
                  </div>

                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 uppercase">Layer 3</span>
                    <h4 className="font-bold text-slate-900 text-xs">Reply-Based Branching Objection Playbook</h4>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Instant switch when prospect replies: &quot;Already have a website&quot;, &quot;Send details&quot;, &quot;Call me later&quot;, or &quot;Interested in SEO only&quot; — giving BDEs the exact response script.
                    </p>
                  </div>
                </div>
              </div>

              {/* Complete Visual Funnel Summary Table */}
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-2">Complete 30-Day Outbound Sales Journey Table</h3>
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Day</th>
                        <th className="p-3">LinkedIn</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">WhatsApp / Phone</th>
                        <th className="p-3">Primary Goal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      <tr className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-indigo-700">Day 1</td>
                        <td className="p-3 text-slate-700">✅ Connection Request (9:30 AM)</td>
                        <td className="p-3 text-slate-700">✅ Company Introduction (11:00 AM)</td>
                        <td className="p-3 text-emerald-700 font-semibold">✅ Friendly Connect (4:00 PM)</td>
                        <td className="p-3 font-bold text-slate-900">Make the First Impression</td>
                      </tr>
                      <tr className="hover:bg-slate-50 bg-slate-50/50">
                        <td className="p-3 font-bold text-indigo-700">Day 5</td>
                        <td className="p-3 text-blue-700">👍 Like/Comment on Post (No DM)</td>
                        <td className="p-3 text-slate-400">—</td>
                        <td className="p-3 text-emerald-700 font-semibold">📁 Portfolio & Case Studies</td>
                        <td className="p-3 font-bold text-slate-900">Build Trust with Portfolio</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-indigo-700">Day 10</td>
                        <td className="p-3 text-slate-400">—</td>
                        <td className="p-3 text-purple-700 font-semibold">💡 Educational Digital Tip</td>
                        <td className="p-3 text-emerald-700 font-semibold">💬 &quot;Shared useful email tip&quot; teaser</td>
                        <td className="p-3 font-bold text-slate-900">Share Valuable Insight</td>
                      </tr>
                      <tr className="hover:bg-slate-50 bg-slate-50/50">
                        <td className="p-3 font-bold text-indigo-700">Day 15</td>
                        <td className="p-3 text-blue-700">📘 Educational Post Share</td>
                        <td className="p-3 text-slate-400">—</td>
                        <td className="p-3 text-emerald-700 font-semibold">🎁 FREE Digital Presence Audit Offer</td>
                        <td className="p-3 font-bold text-slate-900">Start Engagement (High-Value Offer)</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-indigo-700">Day 20</td>
                        <td className="p-3 text-slate-400">—</td>
                        <td className="p-3 text-purple-700 font-semibold">🏆 Client Success Story</td>
                        <td className="p-3 text-emerald-700 font-semibold">💬 &quot;Shared quick success story&quot; teaser</td>
                        <td className="p-3 font-bold text-slate-900">Build Social Proof</td>
                      </tr>
                      <tr className="hover:bg-slate-50 bg-slate-50/50">
                        <td className="p-3 font-bold text-indigo-700">Day 25</td>
                        <td className="p-3 text-slate-400">—</td>
                        <td className="p-3 text-slate-400">—</td>
                        <td className="p-3 text-amber-700 font-bold">📞 2-Min Qualification Call + WhatsApp</td>
                        <td className="p-3 font-bold text-slate-900">Qualify Requirement (Discovery Call)</td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-indigo-700">Day 30</td>
                        <td className="p-3 text-blue-700">🤝 Stay Connected Message</td>
                        <td className="p-3 text-purple-700">🙏 Thank You & Exit Email</td>
                        <td className="p-3 text-emerald-700">🙏 Final Respectful WhatsApp Follow-up</td>
                        <td className="p-3 font-bold text-slate-900">Discovery Call or Respectful Exit</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LAYER 1 30-DAY FUNNEL & TOUCHPOINT TEMPLATES */}
          {activeTab === 'LAYER1_JOURNEY' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">The 8 Touchpoints & Verbatim Templates</h3>
                  <p className="text-slate-500 text-xs">Review or copy the exact messaging sequence sent to prospects.</p>
                </div>
              </div>

              <div className="space-y-4">
                {CADENCE_STEPS_MASTER.map((step) => (
                  <div key={step.stepIndex} className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-black uppercase">
                            Day {step.dayNumber}
                          </span>
                          <span className="text-slate-900 font-bold text-sm">
                            {step.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          🎯 <strong>Goal:</strong> {step.goal} • ⏰ <strong>Timing:</strong> {step.timingGuide}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {step.channels.map(ch => (
                          <span key={ch} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {ch}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-[11px] text-indigo-900 bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100">
                      💡 <strong>Platform Role:</strong> {step.roleNote}
                    </div>

                    {/* Templates Container */}
                    <div className="space-y-3">
                      {/* WhatsApp */}
                      {step.templates.whatsapp && (
                        <div className="p-3 bg-emerald-50/40 border border-emerald-200/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between font-bold text-emerald-900 text-xs">
                            <span className="flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              <span>WhatsApp Template</span>
                            </span>
                            <button
                              onClick={() => handleCopy(step.templates.whatsapp!.message, `wa_${step.stepIndex}`)}
                              className="px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                            >
                              {copiedKey === `wa_${step.stepIndex}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === `wa_${step.stepIndex}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-emerald-100 text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {step.templates.whatsapp.message}
                          </div>
                        </div>
                      )}

                      {/* Email */}
                      {step.templates.email && (
                        <div className="p-3 bg-purple-50/40 border border-purple-200/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between font-bold text-purple-900 text-xs">
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-purple-600" />
                              <span>Email Template</span>
                            </span>
                            <button
                              onClick={() => handleCopy(
                                `Subject: ${step.templates.email!.subject}\n\n${step.templates.email!.body}`,
                                `em_${step.stepIndex}`
                              )}
                              className="px-2 py-0.5 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                            >
                              {copiedKey === `em_${step.stepIndex}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === `em_${step.stepIndex}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-purple-100 text-slate-800 space-y-2">
                            <div className="font-semibold text-purple-950 pb-1 border-b border-purple-50">
                              <span className="text-slate-400 font-normal">Subject: </span>
                              {step.templates.email.subject}
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {step.templates.email.body}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* LinkedIn */}
                      {step.templates.linkedin && (
                        <div className="p-3 bg-blue-50/40 border border-blue-200/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between font-bold text-blue-900 text-xs">
                            <span className="flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-blue-600" />
                              <span>LinkedIn Action: {step.templates.linkedin.actionType}</span>
                            </span>
                            {step.templates.linkedin.message && (
                              <button
                                onClick={() => handleCopy(step.templates.linkedin!.message!, `li_${step.stepIndex}`)}
                                className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                              >
                                {copiedKey === `li_${step.stepIndex}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedKey === `li_${step.stepIndex}` ? 'Copied' : 'Copy'}</span>
                              </button>
                            )}
                          </div>
                          {step.templates.linkedin.actionNote && (
                            <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-amber-800 text-[11px] leading-relaxed">
                              💡 {step.templates.linkedin.actionNote}
                            </div>
                          )}
                          {step.templates.linkedin.message && (
                            <div className="bg-white p-3 rounded-lg border border-blue-100 text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {step.templates.linkedin.message}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Phone (Day 25) */}
                      {step.templates.phone && (
                        <div className="p-3 bg-amber-50/40 border border-amber-200/80 rounded-xl space-y-2">
                          <div className="flex items-center justify-between font-bold text-amber-900 text-xs">
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-amber-600" />
                              <span>Phone Qualification Script & Follow-up Messages</span>
                            </span>
                            <button
                              onClick={() => handleCopy(step.templates.phone!.pitchScript, `phone_pitch_${step.stepIndex}`)}
                              className="px-2 py-0.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 rounded text-[11px] font-bold flex items-center gap-1 transition-all"
                            >
                              {copiedKey === `phone_pitch_${step.stepIndex}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === `phone_pitch_${step.stepIndex}` ? 'Copied Pitch' : 'Copy Pitch'}</span>
                            </button>
                          </div>

                          <div className="bg-white p-3 rounded-lg border border-amber-200 text-slate-800 whitespace-pre-wrap leading-relaxed">
                            <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">
                              📞 2-Minute Call Script:
                            </div>
                            {step.templates.phone.pitchScript}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                            <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg space-y-1">
                              <div className="flex items-center justify-between font-bold text-emerald-900 text-[11px]">
                                <span>✅ WhatsApp (After Call Taken):</span>
                                <button
                                  onClick={() => handleCopy(step.templates.phone!.afterCallTakenWhatsApp, 'post_call')}
                                  className="text-emerald-700 hover:underline font-bold text-[10px]"
                                >
                                  {copiedKey === 'post_call' ? 'Copied!' : 'Copy'}
                                </button>
                              </div>
                              <div className="text-slate-800 text-[11px] whitespace-pre-wrap">
                                {step.templates.phone.afterCallTakenWhatsApp}
                              </div>
                            </div>

                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                              <div className="flex items-center justify-between font-bold text-slate-800 text-[11px]">
                                <span>⏰ WhatsApp (If Missed Call):</span>
                                <button
                                  onClick={() => handleCopy(step.templates.phone!.missedCallWhatsApp, 'missed_call')}
                                  className="text-slate-700 hover:underline font-bold text-[10px]"
                                >
                                  {copiedKey === 'missed_call' ? 'Copied!' : 'Copy'}
                                </button>
                              </div>
                              <div className="text-slate-800 text-[11px] whitespace-pre-wrap">
                                {step.templates.phone.missedCallWhatsApp}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: LAYER 2 INDUSTRY PLAYBOOKS */}
          {activeTab === 'LAYER2_INDUSTRIES' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Layer 2: Industry-Specific Personalization</span>
                </h3>
                <p className="text-slate-500 text-xs">
                  A manufacturing director care about virtual plant tours and RFQ funnels. A hospital owner cares about doctor profiles and NABH compliance.
                </p>
              </div>

              {/* Industry Selector Grid */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                {Object.values(CADENCE_INDUSTRIES).map(ind => (
                  <button
                    key={ind.key}
                    onClick={() => setSelectedIndustryKey(ind.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      selectedIndustryKey === ind.key
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {ind.name}
                  </button>
                ))}
              </div>

              {/* Selected Industry Card */}
              <div className="p-5 rounded-2xl bg-indigo-50/40 border border-indigo-200 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">
                      Industry Angle
                    </span>
                    <h4 className="text-base font-black text-indigo-950 mt-1">
                      {selectedIndustry.name}
                    </h4>
                    <p className="text-xs text-indigo-800">
                      Target Audience: {selectedIndustry.tagline}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">Day 5 Portfolio Hook</span>
                    <p className="text-slate-800 leading-relaxed">
                      {selectedIndustry.portfolioHighlight}
                    </p>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-blue-700 block">Day 10 Educational Tip</span>
                    <p className="text-slate-800 leading-relaxed">
                      {selectedIndustry.valueTip}
                    </p>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-purple-700 block">Day 15 Audit Hook</span>
                    <p className="text-slate-800 leading-relaxed">
                      {selectedIndustry.auditHook}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LAYER 3 REPLY-BASED BRANCHES */}
          {activeTab === 'LAYER3_BRANCHES' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Layer 3: Reply-Based Branching Objection Playbook</span>
                </h3>
                <p className="text-slate-500 text-xs">
                  When a prospect replies to any outreach message, never send the next chronological day template. Immediately branch to their exact response.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {Object.values(CADENCE_REPLY_BRANCHES).map(branch => (
                  <div key={branch.key} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">
                          &quot;{branch.label}&quot;
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Trigger: {branch.triggerCondition}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        branch.nextLeadTemperature === 'HOT' ? 'bg-rose-100 text-rose-800' :
                        branch.nextLeadTemperature === 'WARM' ? 'bg-amber-100 text-amber-800' :
                        branch.nextLeadTemperature === 'LOST' ? 'bg-slate-100 text-slate-700' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {branch.nextLeadTemperature} LEAD
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-[11px]">
                      <strong>Suggested Action:</strong> {branch.suggestedAction}
                    </div>

                    <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-emerald-900 text-[11px]">
                        <span>WhatsApp Reply Script:</span>
                        <button
                          onClick={() => handleCopy(branch.whatsappMessage, `branch_${branch.key}`)}
                          className="px-2 py-0.5 bg-white border border-emerald-300 text-emerald-700 rounded text-[10px] font-bold flex items-center gap-1"
                        >
                          {copiedKey === `branch_${branch.key}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === `branch_${branch.key}` ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {branch.whatsappMessage}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: BDE EXECUTION SOP & RULES */}
          {activeTab === 'BDE_SOP' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>BDE Standard Operating Procedures (SOP)</span>
                </h3>
                <p className="text-slate-500 text-xs">
                  Strict rules of engagement to preserve brand prestige and maximize discovery call booking rate.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Rule 1: Never Repeat the Same Message</span>
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    Always use 2 or 3 platforms together per follow-up milestone, but each channel has a distinct role. Email holds the substance; WhatsApp is the polite notification teaser; LinkedIn is the peer authority touchpoint.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Rule 2: No Back-to-Back LinkedIn DMs</span>
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    On Day 1 we send the connection note. On Day 5 and Day 15, we only like their recent post or share an educational article. We do NOT spam their LinkedIn inbox with sales pitches.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Rule 3: WhatsApp Teasers Double Email Opens</span>
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    When you send an email on Day 10 or Day 20, the short WhatsApp message (*&quot;Just shared one useful email about digital credibility...&quot;*) prompts them to check their inbox immediately.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>Rule 4: The 2-Minute Discovery Call Protocol</span>
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    Day 25 call is NOT a demo. It is a 2-minute qualification check (*&quot;Meet Patel from RND Technosoft... just wanted to check if there is any upcoming digital requirement...&quot;*). If they don&apos;t pick up, send the Missed Call WhatsApp immediately.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 md:col-span-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span>Rule 5: The Day 30 Respectful Exit (Psychological Reversal)</span>
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    Never beg or sound desperate. We clearly announce this is our final follow-up, wish them business growth, and leave the door open. Often, prospects reply to this exact message because guilt is removed and they respect our professionalism.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <span>Official Outbound Manual for</span>
            <strong className="text-slate-800">{tenantName}</strong>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            Close Sales Bible
          </button>
        </div>

      </div>
    </div>
  );
}
