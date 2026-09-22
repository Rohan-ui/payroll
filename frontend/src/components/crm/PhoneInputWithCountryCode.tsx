'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Phone, MessageSquare, ChevronDown } from 'lucide-react';
import { 
  SORTED_COUNTRY_CODES, 
  parsePhoneWithCountryCode, 
  combinePhoneWithCountryCode,
  CountryCodeItem 
} from '@/lib/countryCodes';

interface PhoneInputWithCountryCodeProps {
  value?: string;
  onChange: (fullPhone: string, details?: { countryCode: string; number: string }) => void;
  defaultCountryCode?: string;
  placeholder?: string;
  isWhatsApp?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PhoneInputWithCountryCode({
  value = '',
  onChange,
  defaultCountryCode = '+91',
  placeholder = '98765 43210',
  isWhatsApp = false,
  required = false,
  disabled = false,
  className = '',
  id,
  name,
  size = 'md'
}: PhoneInputWithCountryCodeProps) {
  // Parse incoming value into countryCode and national number
  const parsed = useMemo(() => {
    return parsePhoneWithCountryCode(value, defaultCountryCode);
  }, [value, defaultCountryCode]);

  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [nationalNumber, setNationalNumber] = useState(parsed.number);

  // Sync internal state when external value changes
  useEffect(() => {
    setCountryCode(parsed.countryCode);
    setNationalNumber(parsed.number);
  }, [parsed.countryCode, parsed.number]);

  const handleCountryChange = (newCode: string) => {
    setCountryCode(newCode);
    const combined = combinePhoneWithCountryCode(newCode, nationalNumber);
    onChange(combined, { countryCode: newCode, number: nationalNumber });
  };

  const handleNumberChange = (newNumber: string) => {
    // Only allow digits, spaces, hyphens, and parenthesis in phone numbers
    const sanitized = newNumber.replace(/[^\d\s\-()]/g, '');
    setNationalNumber(sanitized);
    const combined = combinePhoneWithCountryCode(countryCode, sanitized);
    onChange(combined, { countryCode, number: sanitized });
  };

  const heightClass = size === 'sm' ? 'py-1 text-xs' : size === 'lg' ? 'py-2.5 text-sm' : 'py-2 text-xs';

  return (
    <div className={`relative flex items-stretch rounded-xl border transition-all duration-150 ${
      isWhatsApp 
        ? 'border-emerald-200 bg-emerald-50/20 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20' 
        : 'border-slate-200 bg-slate-50/50 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white'
    } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}>
      
      {/* Country Code Dropdown */}
      <div className="relative flex items-center shrink-0 border-r border-slate-200/80 bg-white/70 rounded-l-xl hover:bg-white transition-colors">
        <select
          value={countryCode}
          onChange={(e) => handleCountryChange(e.target.value)}
          disabled={disabled}
          className={`appearance-none pl-2.5 pr-6 bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer ${heightClass}`}
          title="Select Country Calling Code"
        >
          {SORTED_COUNTRY_CODES.map((c) => (
            <option key={`${c.iso}-${c.code}`} value={c.code}>
              {c.flag} {c.code} ({c.name})
            </option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 pointer-events-none" />
      </div>

      {/* Phone Number Input */}
      <div className="relative flex-1 flex items-center">
        <div className="pl-2.5 pr-1 text-slate-400 pointer-events-none flex items-center">
          {isWhatsApp ? (
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
        <input
          type="tel"
          id={id}
          name={name}
          value={nationalNumber}
          onChange={(e) => handleNumberChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`w-full pl-1 pr-3 bg-transparent font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none ${heightClass}`}
        />
      </div>
    </div>
  );
}

export default PhoneInputWithCountryCode;
