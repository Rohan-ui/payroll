import React, { useState } from 'react';
import { Building2, Eye, EyeOff, ArrowRight, ChevronRight, Users, Shield, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

type AuthMode = 'login' | 'register';

const STATS = [
  { icon: Users, label: 'Businesses', value: '2,400+' },
  { icon: Shield, label: 'Compliance rate', value: '99.8%' },
  { icon: TrendingUp, label: 'Payroll runs/month', value: '18,000+' },
];

export const AuthView: React.FC = () => {
  const { login, registerTenant, isLoading, error } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPass, setShowPass] = useState(false);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [company, setCompany] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [adminName, setAdminName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await registerTenant({ companyName: company, tenantCode, email: regEmail, password: regPass, adminName });
  };

  const inputClass =
    'w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all';

  return (
    <div className="min-h-screen flex font-sans">
      {/* ── Left panel (desktop only) ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] bg-[#181724] flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-teal-500/10 blur-2xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-indigo-500/15 translate-x-1/4 translate-y-1/4 blur-2xl" />

        {/* Brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="flex items-center justify-center">
              <img
                src="/voogyo-woodmark-white.png"
                alt="Voogyo"
                className="h-7 w-auto object-contain bg-transparent"
              />
            </div>
          </div>

          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4 tracking-tight">
            The Business OS for<br />
            Modern Enterprises.
          </h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-sm">
            High-converting CRM sales pipelines, automated 30-day email outreach cadences, and 100% compliant Indian payroll.
          </p>
        </div>

        {/* Stats */}
        <div className="relative z-10">
          <div className="grid grid-cols-3 gap-4 mb-8">
            {STATS.map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-xs rounded-2xl p-4 border border-white/5">
                <Icon className="w-5 h-5 text-teal-400 mb-2" />
                <p className="text-white text-xl font-bold">{value}</p>
                <p className="text-slate-300 text-xs">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {['Priya', 'Rohit', 'Anjali', 'Karan'].map((n) => (
                <div
                  key={n}
                  className="w-8 h-8 rounded-full border-2 border-[#181724] bg-teal-500 flex items-center justify-center text-xs font-bold text-white shadow-xs"
                >
                  {n[0]}
                </div>
              ))}
            </div>
            <p className="text-slate-300 text-xs font-medium ml-2">
              Trusted by 500+ growing companies across India
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-surface p-6 sm:p-10">
        {/* Mobile brand */}
        <div className="lg:hidden flex items-center justify-center mb-8">
          <div className="flex items-center justify-center">
            <img
              src="/voogyo-woodmark.png"
              alt="Voogyo"
              className="h-7 w-auto object-contain bg-transparent"
            />
          </div>
        </div>

        <div className="w-full max-w-md">
          {/* Toggle tabs */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-7">
            {(['login', 'register'] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  mode === m
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Get Started'}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* ── Login form ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Work Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="priya@company.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus-visible:outline-none"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" className="text-xs text-teal-600 hover:text-teal-700 font-medium focus-visible:outline-none focus-visible:underline">
                  Forgot password?
                </button>
              </div>
              <Button type="submit" variant="primary" size="lg" loading={isLoading} className="w-full mt-1">
                Sign In <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-center text-xs text-slate-400 pt-2">
                New to RND Payroll?{' '}
                <button type="button" onClick={() => setMode('register')} className="text-teal-600 font-semibold hover:underline">
                  Create account
                </button>
              </p>
            </form>
          )}

          {/* ── Register form ── */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="company" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Company Name
                </label>
                <input
                  id="company"
                  type="text"
                  required
                  placeholder="Acme Pvt Ltd"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tenantCode" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tenant Code
                  <span className="ml-1 text-xs font-normal text-slate-400">(short unique ID)</span>
                </label>
                <input
                  id="tenantCode"
                  type="text"
                  required
                  placeholder="acme-pvt"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="adminName" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Your Name
                </label>
                <input
                  id="adminName"
                  type="text"
                  required
                  placeholder="Priya Sharma"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="regEmail" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Work Email
                </label>
                <input
                  id="regEmail"
                  type="email"
                  required
                  placeholder="priya@acme.in"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="regPass" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="regPass"
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    placeholder="Minimum 10 characters"
                    aria-describedby="regPass-hint"
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus-visible:outline-none"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" variant="primary" size="lg" loading={isLoading} className="w-full mt-1">
                Create Account <ChevronRight className="w-4 h-4" />
              </Button>
              <p className="text-center text-xs text-slate-400 pt-2">
                Already registered?{' '}
                <button type="button" onClick={() => setMode('login')} className="text-teal-600 font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
