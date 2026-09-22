import React, { useState } from 'react';
import {
  X,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  DollarSign,
  Trophy,
  Flame,
  AlertTriangle,
  Send,
  MessageSquare,
  FileText,
  UserCheck,
} from 'lucide-react';
import { CrmLead } from '../../types/crm.types';
import { crmApi } from '../../api/crm.api';

interface Lead360DrawerProps {
  lead: CrmLead | null;
  onClose: () => void;
  onLeadUpdated: () => void;
}

export const Lead360Drawer: React.FC<Lead360DrawerProps> = ({ lead, onClose, onLeadUpdated }) => {
  if (!lead) return null;

  const [activeTab, setActiveTab] = useState<'timeline' | 'call' | 'followup' | 'meeting'>('timeline');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Quick Action Forms
  const [callData, setCallData] = useState({
    title: 'Outbound Client Call',
    callDisposition: 'ANSWERED',
    durationSeconds: 180,
    description: '',
  });

  const [followupData, setFollowupData] = useState({
    scheduledAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    followupType: 'CALL',
    priority: 'HIGH',
    instructions: 'Follow up on proposal review and pricing feedback',
  });

  const [meetingData, setMeetingData] = useState({
    title: `Discovery Demo with ${lead.company_name}`,
    scheduledAt: new Date(Date.now() + 172800000).toISOString().slice(0, 16),
    meetingLink: 'https://meet.google.com/voogyo-demo',
    meetingType: 'DEMO',
  });

  const handleConvertWon = async () => {
    if (!confirm(`Mark ${lead.company_name} as DEAL WON? This will auto-provision an enterprise client and draft a receivable invoice!`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await crmApi.convertDealWon(lead.id);
      setFeedback(`🎉 Deal Won! Client created with code ${res.client?.client_code || 'CL-001'}`);
      onLeadUpdated();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await crmApi.addActivity({
        leadId: lead.id,
        activityType: 'CALL',
        title: callData.title,
        callDisposition: callData.callDisposition,
        durationSeconds: Number(callData.durationSeconds),
        description: callData.description,
      });
      setFeedback('Call logged successfully!');
      setCallData({ ...callData, description: '' });
      setActiveTab('timeline');
      onLeadUpdated();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await crmApi.createFollowup({
        leadId: lead.id,
        scheduledAt: new Date(followupData.scheduledAt).toISOString(),
        followupType: followupData.followupType,
        priority: followupData.priority,
        instructions: followupData.instructions,
      });
      setFeedback('Follow-up scheduled successfully!');
      setActiveTab('timeline');
      onLeadUpdated();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await crmApi.createMeeting({
        leadId: lead.id,
        title: meetingData.title,
        scheduledAt: new Date(meetingData.scheduledAt).toISOString(),
        meetingLink: meetingData.meetingLink,
        meetingType: meetingData.meetingType,
      });
      setFeedback('Demo meeting scheduled successfully!');
      setActiveTab('timeline');
      onLeadUpdated();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCadenceTouchpoint = async (channel: string) => {
    setIsSubmitting(true);
    try {
      await crmApi.executeCadenceStep({
        leadId: lead.id,
        channel,
        notes: `Executed 30-Day cadence touchpoint via ${channel}`,
      });
      setFeedback(`Dispatched cadence action via ${channel}!`);
      onLeadUpdated();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm flex justify-end transition-opacity">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        {/* ── Drawer Header ───────────────────────────────────────────── */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
              {lead.lead_code}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${
                lead.temperature === 'HOT'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : lead.temperature === 'WARM'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Flame className="w-3 h-3" />
              {lead.temperature} LEAD
            </span>

            {lead.is_sla_breached && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                SLA BREACHED
              </span>
            )}
          </div>

          <h2 className="text-xl font-black text-slate-900">{lead.company_name}</h2>
          <p className="text-sm font-semibold text-slate-600">
            {lead.first_name} {lead.last_name || ''}
          </p>

          {/* Quick Contact Chips */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-teal-700 hover:underline">
              <Mail className="w-3.5 h-3.5" />
              {lead.email}
            </a>
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-teal-700 hover:underline">
              <Phone className="w-3.5 h-3.5" />
              {lead.phone}
            </a>
            {lead.city && (
              <span className="flex items-center gap-1 text-slate-400">
                <MapPin className="w-3.5 h-3.5" />
                {lead.city}, {lead.state || 'India'}
              </span>
            )}
          </div>

          {/* Deal Value & Win Probability Bar */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-200/60">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Deal Budget</span>
              <p className="text-lg font-black text-slate-900">
                ₹{Number(lead.budget_amount || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Win Probability</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-500 h-full rounded-full"
                    style={{ width: `${lead.win_probability || 50}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-900">{lead.win_probability}%</span>
              </div>
            </div>
          </div>

          {/* 1-Click "Deal Won" Conversion Ribbon */}
          {!lead.is_won && (
            <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Ready to close?</span>
                <span className="text-[11px] text-slate-500">Instantly creates client & ledger invoice</span>
              </div>
              <button
                onClick={handleConvertWon}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg flex items-center gap-1.5 transition active:scale-95"
              >
                <Trophy className="w-4 h-4" />
                1-Click Deal Won
              </button>
            </div>
          )}

          {lead.is_won && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              This opportunity was WON! Hand-off completed to client accounts.
            </div>
          )}
        </div>

        {/* ── Feedback Notification ───────────────────────────────────── */}
        {feedback && (
          <div className="mx-6 mt-3 p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-teal-600 font-bold">
              ×
            </button>
          </div>
        )}

        {/* ── Quick Action Tabs ───────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'timeline' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Activities ({lead.rndtechnosoft_crm_lead_activities?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('call')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'call' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Log Call
          </button>
          <button
            onClick={() => setActiveTab('followup')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'followup' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Follow-Up
          </button>
          <button
            onClick={() => setActiveTab('meeting')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'meeting' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Demo Meeting
          </button>
        </div>

        {/* ── Tab Content Area ────────────────────────────────────────── */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {/* Quick 30-Day Outreach Triggers */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
              Instant 30-Day Cadence Triggers
            </span>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => handleCadenceTouchpoint('WHATSAPP')}
                className="py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-emerald-200 transition"
              >
                <MessageSquare className="w-3 h-3" />
                WhatsApp
              </button>
              <button
                onClick={() => handleCadenceTouchpoint('EMAIL')}
                className="py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-indigo-200 transition"
              >
                <Mail className="w-3 h-3" />
                Email
              </button>
              <button
                onClick={() => handleCadenceTouchpoint('CALL')}
                className="py-1.5 px-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-sky-200 transition"
              >
                <Phone className="w-3 h-3" />
                Call
              </button>
              <button
                onClick={() => handleCadenceTouchpoint('LINKEDIN')}
                className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-blue-200 transition"
              >
                <Send className="w-3 h-3" />
                LinkedIn
              </button>
            </div>
          </div>

          {/* TAB: TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Touchpoint History</h4>
              {(!lead.rndtechnosoft_crm_lead_activities || lead.rndtechnosoft_crm_lead_activities.length === 0) ? (
                <p className="text-xs text-slate-400 italic text-center py-6">
                  No recorded activities yet. Log a call or send a cadence dispatch!
                </p>
              ) : (
                <div className="relative border-l border-slate-200 ml-3 space-y-4">
                  {lead.rndtechnosoft_crm_lead_activities.map((act) => (
                    <div key={act.id} className="ml-4 relative">
                      <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-teal-500 ring-4 ring-white" />
                      <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900">{act.title}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(act.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {act.description && <p className="text-xs text-slate-600">{act.description}</p>}
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
                          <span>{act.activity_type}</span>
                          {act.call_disposition && (
                            <span className="text-teal-700 font-semibold">• {act.call_disposition}</span>
                          )}
                          <span>• {new Date(act.created_at).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: LOG CALL */}
          {activeTab === 'call' && (
            <form onSubmit={handleLogCall} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Call Title</label>
                <input
                  type="text"
                  required
                  value={callData.title}
                  onChange={(e) => setCallData({ ...callData, title: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Disposition</label>
                  <select
                    value={callData.callDisposition}
                    onChange={(e) => setCallData({ ...callData, callDisposition: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="ANSWERED">Answered & Discussed</option>
                    <option value="BUSY">Busy / Call Later</option>
                    <option value="DEMO_CONFIRMED">Demo Confirmed</option>
                    <option value="GATEKEEPER">Gatekeeper Blocked</option>
                    <option value="NOT_INTERESTED">Not Interested</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Duration (Seconds)</label>
                  <input
                    type="number"
                    value={callData.durationSeconds}
                    onChange={(e) => setCallData({ ...callData, durationSeconds: parseInt(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Call Notes</label>
                <textarea
                  rows={3}
                  placeholder="Key discussion points, budget confirmation, pain points..."
                  value={callData.description}
                  onChange={(e) => setCallData({ ...callData, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow transition"
              >
                Log Call Touchpoint
              </button>
            </form>
          )}

          {/* TAB: SCHEDULE FOLLOW-UP */}
          {activeTab === 'followup' && (
            <form onSubmit={handleScheduleFollowup} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={followupData.scheduledAt}
                  onChange={(e) => setFollowupData({ ...followupData, scheduledAt: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Task Type</label>
                  <select
                    value={followupData.followupType}
                    onChange={(e) => setFollowupData({ ...followupData, followupType: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="CALL">Phone Call</option>
                    <option value="WHATSAPP">WhatsApp Message</option>
                    <option value="EMAIL">Email Dispatch</option>
                    <option value="DEMO">Product Demo</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Priority</label>
                  <select
                    value={followupData.priority}
                    onChange={(e) => setFollowupData({ ...followupData, priority: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent 🔥</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Instructions / Goal</label>
                <textarea
                  rows={3}
                  value={followupData.instructions}
                  onChange={(e) => setFollowupData({ ...followupData, instructions: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow transition"
              >
                Schedule Task
              </button>
            </form>
          )}

          {/* TAB: SCHEDULE MEETING */}
          {activeTab === 'meeting' && (
            <form onSubmit={handleScheduleMeeting} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Meeting Title</label>
                <input
                  type="text"
                  required
                  value={meetingData.title}
                  onChange={(e) => setMeetingData({ ...meetingData, title: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Meeting Time</label>
                <input
                  type="datetime-local"
                  required
                  value={meetingData.scheduledAt}
                  onChange={(e) => setMeetingData({ ...meetingData, scheduledAt: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Google Meet / Zoom URL</label>
                <input
                  type="url"
                  value={meetingData.meetingLink}
                  onChange={(e) => setMeetingData({ ...meetingData, meetingLink: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow transition"
              >
                Schedule Demo
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
