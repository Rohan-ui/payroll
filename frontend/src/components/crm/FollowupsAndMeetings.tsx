'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { 
  CheckCircle2, Clock, Calendar, Video, Phone, Plus, RefreshCw,
  AlertTriangle, Trash2, Edit3, Check, MapPin, X, FileText, Eye,
  ChevronLeft, ChevronRight, Copy, ExternalLink, Sparkles, User
} from 'lucide-react';

interface FollowupsAndMeetingsProps {
  leads: any[];
  initialLeadId?: string | null;
  autoOpenType?: 'followup' | 'meeting' | null;
  onRefreshParent: () => void;
  onSelectLead360?: (leadId: string) => void;
  onCreateQuotation?: (leadId: string) => void;
  isScheduleFollowupOpen?: boolean;
  onCloseScheduleFollowup?: () => void;
  isScheduleMeetingOpen?: boolean;
  onCloseScheduleMeeting?: () => void;
}

export default function FollowupsAndMeetings({
  leads,
  initialLeadId,
  autoOpenType,
  onRefreshParent,
  onSelectLead360,
  onCreateQuotation,
  isScheduleFollowupOpen,
  onCloseScheduleFollowup,
  isScheduleMeetingOpen,
  onCloseScheduleMeeting
}: FollowupsAndMeetingsProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'followups' | 'meetings'>('calendar');
  const [followups, setFollowups] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarFilter, setCalendarFilter] = useState<'ALL' | 'MEETINGS' | 'FOLLOWUPS'>('ALL');
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<any | null>(null);

  const handleGenerateGoogleMeet = () => {
    const p1 = Math.random().toString(36).substring(2, 5);
    const p2 = Math.random().toString(36).substring(2, 6);
    const p3 = Math.random().toString(36).substring(2, 5);
    const generated = `https://meet.google.com/${p1}-${p2}-${p3}`;
    setMeetLink(generated);
    setMeetType('GOOGLE_MEET');
    showToast('Instant Google Meet link generated!');
  };

  const handleCopyClientInvite = () => {
    const selectedLead = leads.find(l => l.id === targetLeadId);
    const leadName = selectedLead ? `${selectedLead.first_name} ${selectedLead.last_name || ''}`.trim() : 'Client';
    const timeFormatted = meetDate ? new Date(meetDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Scheduled Time';
    const invite = `Hi ${leadName},\n\nLooking forward to speaking with you for "${meetTitle}".\n\n📅 Date & Time: ${timeFormatted} (${meetDuration} mins)\n📍 Video Meeting Link: ${meetLink}\n\nPlease let me know if you need to reschedule. Thank you!`;
    navigator.clipboard.writeText(invite);
    showToast('Client invitation copied to clipboard!');
  };

  // Modals
  const [showAddFollowup, setShowAddFollowup] = useState(false);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [showMOMModal, setShowMOMModal] = useState(false);
  const [selectedMeetingForMOM, setSelectedMeetingForMOM] = useState<any>(null);
  const [momText, setMomText] = useState('');

  // Form states
  const [targetLeadId, setTargetLeadId] = useState(leads[0]?.id || '');
  const [fupDate, setFupDate] = useState('');
  const [fupType, setFupType] = useState('CALL');
  const [fupPriority, setFupPriority] = useState('HIGH');
  const [fupInstructions, setFupInstructions] = useState('');

  const [meetTitle, setMeetTitle] = useState('Discovery & Solution Architecture Call');
  const [meetDate, setMeetDate] = useState('');
  const [meetType, setMeetType] = useState('GOOGLE_MEET');
  const [meetLink, setMeetLink] = useState('https://meet.google.com/rnd-voogyo-sync');
  const [meetDuration, setMeetDuration] = useState(30);

  const [submitting, setSubmitting] = useState(false);

  // In-app Delete Confirmation state (Zero browser dialogs)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; type: 'followup' | 'meeting'; title: string } | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fRes, mRes] = await Promise.all([
        fetch('/api/v1/crm/followups'),
        fetch('/api/v1/crm/meetings')
      ]);
      const fJson = await fRes.json();
      const mJson = await mRes.json();
      if (fJson.success) setFollowups(fJson.data || []);
      if (mJson.success) setMeetings(mJson.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const closeAddFollowup = () => {
    setShowAddFollowup(false);
    onCloseScheduleFollowup?.();
  };

  const closeAddMeeting = () => {
    setShowAddMeeting(false);
    onCloseScheduleMeeting?.();
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isScheduleFollowupOpen) {
      setActiveTab('followups');
      if (leads.length > 0 && !targetLeadId) {
        setTargetLeadId(leads[0].id);
      }
      setShowAddFollowup(true);
    }
  }, [isScheduleFollowupOpen, leads, targetLeadId]);

  useEffect(() => {
    if (isScheduleMeetingOpen) {
      setActiveTab('meetings');
      if (leads.length > 0 && !targetLeadId) {
        setTargetLeadId(leads[0].id);
      }
      setShowAddMeeting(true);
    }
  }, [isScheduleMeetingOpen, leads, targetLeadId]);

  useEffect(() => {
    if (initialLeadId) {
      setTargetLeadId(initialLeadId);
    }
    if (autoOpenType === 'meeting') {
      setActiveTab('meetings');
      setShowAddMeeting(true);
    } else if (autoOpenType === 'followup') {
      setActiveTab('followups');
      setShowAddFollowup(true);
    }
  }, [initialLeadId, autoOpenType]);

  const handleCreateFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLeadId || !fupDate) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/crm/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: targetLeadId,
          scheduledAt: fupDate,
          followupType: fupType,
          priority: fupPriority,
          instructions: fupInstructions
        })
      });
      if (res.ok) {
        closeAddFollowup();
        fetchData();
        onRefreshParent();
        showToast('Follow-up reminder set successfully!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLeadId || !meetDate || !meetTitle) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/crm/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: targetLeadId,
          title: meetTitle,
          meetingType: meetType,
          scheduledAt: meetDate,
          durationMinutes: meetDuration,
          meetingLink: meetLink
        })
      });
      if (res.ok) {
        closeAddMeeting();
        fetchData();
        onRefreshParent();
        showToast('Meeting scheduled successfully!');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteFollowup = async (id: string) => {
    try {
      await fetch(`/api/v1/crm/followups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      fetchData();
      onRefreshParent();
    } catch (err) {
      console.error(err);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmTarget) return;
    try {
      const endpoint = deleteConfirmTarget.type === 'followup' 
        ? `/api/v1/crm/followups/${deleteConfirmTarget.id}` 
        : `/api/v1/crm/meetings/${deleteConfirmTarget.id}`;
      await fetch(endpoint, { method: 'DELETE' });
      showToast(`${deleteConfirmTarget.type === 'followup' ? 'Follow-up' : 'Meeting'} deleted successfully`);
      setDeleteConfirmTarget(null);
      fetchData();
      onRefreshParent();
    } catch (err: any) {
      console.error(err);
      showToast('Delete failed: ' + err.message);
    }
  };

  const handleOpenMOM = (m: any) => {
    setSelectedMeetingForMOM(m);
    setMomText(m.minutes_of_meeting || '');
    setShowMOMModal(true);
  };

  const handleSaveMOM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeetingForMOM) return;
    setSubmitting(true);
    try {
      await fetch(`/api/v1/crm/meetings/${selectedMeetingForMOM.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minutes_of_meeting: momText,
          status: 'COMPLETED'
        })
      });
      setShowMOMModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const overdueCount = followups.filter(f => f.is_overdue && f.status === 'PENDING').length;

  // Calendar Days calculation
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{ date: Date; dateStr: string; isCurrentMonth: boolean; events: any[] }> = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: d, dateStr, isCurrentMonth: false, events: [] });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dateStr = d.toISOString().split('T')[0];

      // Match followups
      const dayFollowups = followups
        .filter(f => f.scheduled_at?.startsWith(dateStr))
        .map(f => ({ ...f, eventType: 'FOLLOWUP' }));

      // Match meetings
      const dayMeetings = meetings
        .filter(m => m.scheduled_at?.startsWith(dateStr))
        .map(m => ({ ...m, eventType: 'MEETING' }));

      let dayEvents: any[] = [];
      if (calendarFilter === 'ALL') {
        dayEvents = [...dayMeetings, ...dayFollowups];
      } else if (calendarFilter === 'MEETINGS') {
        dayEvents = dayMeetings;
      } else {
        dayEvents = dayFollowups;
      }

      days.push({ date: d, dateStr, isCurrentMonth: true, events: dayEvents });
    }

    // Next month padding to fill complete weeks (35 or 42 grid cells)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: d, dateStr, isCurrentMonth: false, events: [] });
    }

    return days;
  }, [currentMonth, followups, meetings, calendarFilter]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="space-y-4 relative">
      {/* Toast */}
      {toastText && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastText}</span>
        </div>
      )}

      {/* Top Tabs & Actions */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendar Schedule ({followups.length + meetings.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('followups')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'followups'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Follow-up Queue ({followups.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('meetings')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'meetings'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Client Meetings ({meetings.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFollowup(true)}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Schedule Follow-up</span>
          </button>

          <button
            onClick={() => setShowAddMeeting(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Schedule Meeting</span>
          </button>

          <button
            onClick={fetchData}
            className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-500 transition-colors cursor-pointer"
            title="Refresh Activities"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* TAB 0: CALENDAR SCHEDULE VIEW */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          {/* Calendar Top Controls */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Pills & Legend */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <button
                onClick={() => setCalendarFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  calendarFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Events ({followups.length + meetings.length})
              </button>
              <button
                onClick={() => setCalendarFilter('MEETINGS')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  calendarFilter === 'MEETINGS'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Client Meetings ({meetings.length})</span>
              </button>
              <button
                onClick={() => setCalendarFilter('FOLLOWUPS')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  calendarFilter === 'FOLLOWUPS'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Follow-ups ({followups.length})</span>
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Day of week headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 text-center py-2.5">
              <span>SUN</span>
              <span>MON</span>
              <span>TUE</span>
              <span>WED</span>
              <span>THU</span>
              <span>FRI</span>
              <span>SAT</span>
            </div>

            {/* Calendar Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100">
              {calendarDays.map((dayItem, idx) => {
                const isToday = new Date().toISOString().split('T')[0] === dayItem.dateStr;
                return (
                  <div
                    key={idx}
                    className={`min-h-[110px] p-1.5 bg-white transition-colors ${
                      !dayItem.isCurrentMonth ? 'bg-slate-50/50 text-slate-300' : 'text-slate-800'
                    } ${isToday ? 'ring-2 ring-blue-500/40 ring-inset' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        isToday ? 'bg-blue-600 text-white' : dayItem.isCurrentMonth ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        {dayItem.date.getDate()}
                      </span>
                      {dayItem.events.length > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          {dayItem.events.length} event{dayItem.events.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 max-h-[85px] overflow-y-auto no-scrollbar">
                      {dayItem.events.map((evt, eIdx) => {
                        const isMeeting = evt.eventType === 'MEETING';
                        const timeStr = evt.scheduled_at 
                          ? new Date(evt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '';

                        return (
                          <div
                            key={eIdx}
                            onClick={() => setSelectedCalendarEvent(evt)}
                            className={`p-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer truncate flex items-center gap-1 ${
                              isMeeting
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                                : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                            }`}
                            title={`${isMeeting ? 'Meeting' : 'Follow-up'}: ${evt.company_name} at ${timeStr}`}
                          >
                            {isMeeting ? (
                              <Video className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                            )}
                            <span className="font-bold shrink-0">{timeStr}</span>
                            <span className="truncate">{evt.company_name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: FOLLOW-UPS LIST */}
      {activeTab === 'followups' && (
        <div className="space-y-3">
          {overdueCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                <strong>SLA Breach Alert:</strong> {overdueCount} follow-up(s) have exceeded their scheduled time. Follow up immediately to prevent deal slippage.
              </span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Deal / Company</th>
                  <th className="py-3 px-4">Scheduled Date & Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Instructions</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {followups.map((fup) => (
                  <tr key={fup.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {fup.company_name}
                      <p className="text-[11px] text-slate-400 font-normal">{fup.first_name} {fup.last_name}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${fup.is_overdue && fup.status === 'PENDING' ? 'text-red-600 font-bold' : 'text-slate-800'}`}>
                        {new Date(fup.scheduled_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </span>
                      {fup.is_overdue && fup.status === 'PENDING' && (
                        <span className="block text-[10px] text-red-600 font-bold">OVERDUE</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                        {fup.followup_type}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        fup.priority === 'URGENT' ? 'bg-red-50 text-red-700 border border-red-200' :
                        fup.priority === 'HIGH' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {fup.priority}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                      {fup.instructions || 'Routine client check-in'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        fup.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {fup.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 📄 Quick Proposal */}
                        {onCreateQuotation && fup.lead_id && (
                          <button
                            onClick={() => onCreateQuotation(fup.lead_id)}
                            className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Generate Proposal for this Lead"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 🔍 View 360 */}
                        {onSelectLead360 && fup.lead_id && (
                          <button
                            onClick={() => onSelectLead360(fup.lead_id)}
                            className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                            title="View 360° Lead Dossier"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {fup.status !== 'COMPLETED' && (
                          <button
                            onClick={() => handleCompleteFollowup(fup.id)}
                            className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                            title="Mark as Completed"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirmTarget({ id: fup.id, type: 'followup', title: fup.company_name || 'Follow-up' })}
                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                          title="Delete Follow-up"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {followups.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No follow-ups recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MEETINGS LIST */}
      {activeTab === 'meetings' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map((m) => (
              <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100">
                      {m.meeting_type}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      m.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {m.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-xs">{m.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{m.company_name} ({m.first_name} {m.last_name})</p>

                  <div className="mt-3 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{new Date(m.scheduled_at).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{m.duration_minutes} Minutes</span>
                    </div>
                  </div>

                  {m.minutes_of_meeting && (
                    <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700">
                      <strong className="block text-slate-500 uppercase text-[9px]">MOM Minutes:</strong>
                      {m.minutes_of_meeting}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  {m.meeting_link ? (
                    <a
                      href={m.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join Meet</span>
                    </a>
                  ) : <span />}

                  <div className="flex items-center gap-1">
                    {/* 📄 Quick Proposal */}
                    {onCreateQuotation && m.lead_id && (
                      <button
                        onClick={() => onCreateQuotation(m.lead_id)}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold rounded flex items-center gap-1"
                        title="Generate Proposal for this Client"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Quote</span>
                      </button>
                    )}

                    {/* 🔍 View 360 */}
                    {onSelectLead360 && m.lead_id && (
                      <button
                        onClick={() => onSelectLead360(m.lead_id)}
                        className="p-1 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded"
                        title="View 360° Lead Dossier"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenMOM(m)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded flex items-center gap-1"
                      title="Record Meeting Minutes"
                    >
                      <FileText className="w-3 h-3" />
                      <span>MOM</span>
                    </button>
                    <button
                      onClick={() => setDeleteConfirmTarget({ id: m.id, type: 'meeting', title: m.title || 'Client Meeting' })}
                      className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded"
                      title="Delete Meeting"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {meetings.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                No meetings scheduled.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCHEDULE FOLLOWUP MODAL */}
      {showAddFollowup && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">Schedule Lead Follow-up</h3>
              <button onClick={closeAddFollowup}>
                <X className="w-4 h-4 text-slate-500 cursor-pointer" />
              </button>
            </div>
            <form onSubmit={handleCreateFollowup} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Lead *</label>
                <select
                  value={targetLeadId}
                  onChange={(e) => setTargetLeadId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.company_name} ({l.first_name})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Scheduled Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={fupDate}
                  onChange={(e) => setFupDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Type</label>
                  <select
                    value={fupType}
                    onChange={(e) => setFupType(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                  >
                    <option value="CALL">Phone Call</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">Email Check-in</option>
                    <option value="MEETING">In-Person Meeting</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={fupPriority}
                    onChange={(e) => setFupPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                  >
                    <option value="URGENT">🚨 Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instructions / Goal</label>
                <textarea
                  rows={2}
                  value={fupInstructions}
                  onChange={(e) => setFupInstructions(e.target.value)}
                  placeholder="Check if client reviewed proposal terms..."
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddFollowup}
                  className="px-3 py-1.5 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Set Reminder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE MEETING MODAL */}
      {showAddMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">Schedule Client Meeting</h3>
              <button onClick={closeAddMeeting}>
                <X className="w-4 h-4 text-slate-500 cursor-pointer" />
              </button>
            </div>
            <form onSubmit={handleCreateMeeting} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Lead *</label>
                <select
                  value={targetLeadId}
                  onChange={(e) => setTargetLeadId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.company_name} ({l.first_name})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  value={meetTitle}
                  onChange={(e) => setMeetTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={meetDate}
                    onChange={(e) => setMeetDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    value={meetDuration}
                    onChange={(e) => setMeetDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Platform</label>
                  <select
                    value={meetType}
                    onChange={(e) => setMeetType(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                  >
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="ZOOM">Zoom</option>
                    <option value="IN_PERSON">In-Person</option>
                    <option value="PHONE">Phone</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Meeting URL</label>
                  <input
                    type="url"
                    value={meetLink}
                    onChange={(e) => setMeetLink(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg font-mono text-[11px]"
                  />
                </div>
              </div>

              {meetType === 'GOOGLE_MEET' && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateGoogleMeet}
                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>⚡ Generate Free Google Meet</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyClientInvite}
                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Copy className="w-3 h-3 text-indigo-600" />
                    <span>Copy Client Invite</span>
                  </button>
                </div>
              )}

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddMeeting}
                  className="px-3 py-1.5 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 text-white font-semibold text-xs rounded-lg cursor-pointer"
                >
                  {submitting ? 'Scheduling...' : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CALENDAR EVENT DETAIL MODAL */}
      {selectedCalendarEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between ${
              selectedCalendarEvent.eventType === 'MEETING' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
            }`}>
              <div className="flex items-center gap-2">
                {selectedCalendarEvent.eventType === 'MEETING' ? (
                  <Video className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-600" />
                )}
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                  {selectedCalendarEvent.eventType === 'MEETING' ? 'Meeting Details' : 'Follow-up Details'}
                </h3>
              </div>
              <button onClick={() => setSelectedCalendarEvent(null)} className="p-1 hover:bg-white/80 rounded-lg text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Company / Client</span>
                <span className="text-base font-bold text-slate-900">{selectedCalendarEvent.company_name}</span>
                <p className="text-slate-500">{selectedCalendarEvent.first_name} {selectedCalendarEvent.last_name || ''}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Scheduled Date</span>
                  <span className="font-bold text-slate-800">
                    {new Date(selectedCalendarEvent.scheduled_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Scheduled Time</span>
                  <span className="font-bold text-slate-800">
                    {new Date(selectedCalendarEvent.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {selectedCalendarEvent.eventType === 'MEETING' ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Meeting Title</span>
                    <span className="font-semibold text-slate-800">{selectedCalendarEvent.title}</span>
                  </div>
                  {selectedCalendarEvent.meeting_link && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Meeting Link</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={selectedCalendarEvent.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 text-xs transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Join Google Meet</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedCalendarEvent.meeting_link);
                            showToast('Meeting link copied!');
                          }}
                          className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600"
                          title="Copy Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Priority & Type</span>
                    <span className="font-bold text-amber-700">{selectedCalendarEvent.priority} • {selectedCalendarEvent.followup_type}</span>
                  </div>
                  {selectedCalendarEvent.instructions && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Instructions / Agenda</span>
                      <p className="p-2 bg-slate-50 rounded-lg border text-slate-700">{selectedCalendarEvent.instructions}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t flex items-center justify-between">
                {onSelectLead360 && (
                  <button
                    onClick={() => {
                      onSelectLead360(selectedCalendarEvent.lead_id);
                      setSelectedCalendarEvent(null);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>View Lead 360</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedCalendarEvent(null)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOM MINUTES MODAL */}
      {showMOMModal && selectedMeetingForMOM && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                Meeting Minutes (MOM) — {selectedMeetingForMOM.title}
              </h3>
              <button onClick={() => setShowMOMModal(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSaveMOM} className="p-5 space-y-3">
              <p className="text-xs text-slate-500">
                Record discussion points, client decisions, scope adjustments, and action items.
              </p>
              <textarea
                rows={6}
                required
                value={momText}
                onChange={(e) => setMomText(e.target.value)}
                placeholder="1. Client approved Next.js frontend architecture.
2. Deliver prototype within 10 days.
3. Advance payment agreed at 40%."
                className="w-full p-3 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
              />
              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMOMModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg"
                >
                  {submitting ? 'Saving MOM...' : 'Save & Mark Complete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP DELETE CONFIRMATION MODAL (No browser confirm) */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900">
                Delete {deleteConfirmTarget.type === 'followup' ? 'Follow-up' : 'Meeting'}?
              </h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete <span className="font-bold text-slate-800">&quot;{deleteConfirmTarget.title}&quot;</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toastText && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl bg-slate-900 text-white text-xs font-semibold animate-in slide-in-from-top">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastText}</span>
        </div>
      )}
    </div>
  );
}
