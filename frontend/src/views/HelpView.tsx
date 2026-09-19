import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Mail, Phone, BookOpen, Video } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: 'How do I run payroll for the month?',
    a: 'Go to Payroll in the sidebar. Click "Run Payroll for October 2026". Review the 4 steps: employees, attendance, variable inputs, and approve. The entire process takes under 5 minutes.',
  },
  {
    q: 'What happens if an employee has Loss of Pay (LOP)?',
    a: 'In the Attendance step of the payroll wizard, enter the number of LOP days per employee. The system automatically pro-rates their salary and flags it as an anomaly for your review.',
  },
  {
    q: 'How is PF calculated?',
    a: 'EPF is 12% of Basic Salary. If PF wage ceiling is enabled (₹15,000), the 12% is applied on the lower of actual basic or ₹15,000. Employer also contributes 12% (split: 8.33% EPS + 3.67% EPF).',
  },
  {
    q: 'How do I download a payslip?',
    a: 'Go to Payslips. Select the employee and click the "View" button next to the month. The payslip modal opens with a "Download PDF" option.',
  },
  {
    q: 'When is ESIC applicable?',
    a: 'ESIC applies to employees with gross salary ≤ ₹21,000/month. Employee contribution is 0.75% of gross; employer is 3.25%. If an employee\'s salary rises above the threshold, they exit ESIC in the next ESI contribution period.',
  },
  {
    q: 'How do I add a new employee?',
    a: 'Go to People → click "Add Employee". Fill in personal details, designation, joining date, and bank details. The employee will appear in the next payroll run.',
  },
  {
    q: 'Can I edit a finalised payslip?',
    a: 'No. Finalised payslips are immutable for audit compliance. If you need to correct an error, create a manual adjustment in the next month\'s variable inputs and document the reason.',
  },
  {
    q: 'What is Professional Tax (PT)?',
    a: 'PT is a state-level tax on employment income. Slabs vary by state (e.g., Maharashtra ₹200/month for salary > ₹10,000; Telangana ₹200/month; Karnataka progressive slab). The system applies the correct slab based on each employee\'s work state.',
  },
];

const Faq: React.FC<{ item: FaqItem }> = ({ item }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-700">{item.q}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed bg-mint-50/50">
          {item.a}
        </div>
      )}
    </div>
  );
};

const CONTACT_OPTIONS = [
  {
    icon: MessageCircle,
    title: 'WhatsApp Support',
    desc: 'Chat with our support team on WhatsApp. Typically replies within 30 minutes during business hours.',
    action: 'Open WhatsApp',
    href: 'https://wa.me/919876543210',
    variant: 'primary' as const,
  },
  {
    icon: Mail,
    title: 'Email Support',
    desc: 'Send us a detailed query. We respond within 24 hours on working days.',
    action: 'Send Email',
    href: 'mailto:support@rndtechnosoft.com',
    variant: 'secondary' as const,
  },
  {
    icon: Phone,
    title: 'Call Us',
    desc: 'Mon–Fri, 10 AM – 6 PM IST. For urgent payroll or compliance issues.',
    action: '+91 98765 43210',
    href: 'tel:+919876543210',
    variant: 'outline' as const,
  },
];

export const HelpView: React.FC = () => (
  <div className="space-y-6 max-w-3xl">
    <div>
      <h1 className="text-xl font-bold text-slate-800">Help & Support</h1>
      <p className="text-sm text-slate-500 mt-0.5">Guides, FAQs, and contact options</p>
    </div>

    {/* Quick guides */}
    <div className="grid sm:grid-cols-2 gap-3">
      {[
        { icon: Video,     title: 'How to run payroll',         label: '4 min video' },
        { icon: BookOpen,  title: 'Statutory compliance guide',  label: 'PDF guide' },
        { icon: BookOpen,  title: 'Adding employees',            label: 'Written guide' },
        { icon: Video,     title: 'Understanding payslips',      label: '2 min video' },
      ].map(({ icon: Icon, title, label }) => (
        <button
          key={title}
          className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl hover:border-teal-200 hover:shadow-card-hover transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">{title}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        </button>
      ))}
    </div>

    {/* FAQ */}
    <div>
      <h2 className="text-base font-bold text-slate-800 mb-3">Frequently Asked Questions</h2>
      <Card padded={false}>
        {FAQS.map((faq) => (
          <Faq key={faq.q} item={faq} />
        ))}
      </Card>
    </div>

    {/* Contact */}
    <div>
      <h2 className="text-base font-bold text-slate-800 mb-3">Contact Support</h2>
      <div className="grid sm:grid-cols-3 gap-4">
        {CONTACT_OPTIONS.map(({ icon: Icon, title, desc, action, href, variant }) => (
          <Card key={title} className="flex flex-col gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <Icon className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{title}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
            </div>
            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-auto">
              <Button variant={variant} size="sm" className="w-full">{action}</Button>
            </a>
          </Card>
        ))}
      </div>
    </div>
  </div>
);
