import React from 'react';

interface VoogyoLogoProps {
  variant?: 'full' | 'wordmark' | 'mark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  withTagline?: boolean;
  className?: string;
  taglineClassName?: string;
  customTagline?: string;
}

export function VoogyoMark({ 
  className = '', 
  size = 32 
}: { 
  className?: string; 
  size?: number | string 
}) {
  const pixelSize = typeof size === 'number' ? size : parseInt(size as string, 10) || 32;
  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`} 
      style={{ width: size, height: size }}
    >
      <img
        src="/voogyo-mark.png"
        alt="Voogyo Mark"
        className="w-full h-full object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLElement).style.display = 'none';
        }}
      />
    </div>
  );
}

export default function VoogyoLogo({
  variant = 'full',
  size = 'md',
  withTagline = false,
  className = '',
  taglineClassName = '',
  customTagline
}: VoogyoLogoProps) {
  if (variant === 'mark') {
    const sizeMap = {
      xs: 20,
      sm: 26,
      md: 34,
      lg: 42,
      xl: 52
    };
    return <VoogyoMark size={sizeMap[size]} className={className} />;
  }

  const heightMap = {
    xs: 22,
    sm: 30,
    md: 38,
    lg: 48,
    xl: 60
  };

  const currentHeight = heightMap[size];
  const showFullLogoWithTagline = (variant === 'full' && withTagline && !customTagline);
  const imageSrc = showFullLogoWithTagline ? '/voogyo-logo.png' : '/voogyo-wordmark.png';
  const aspectRatio = showFullLogoWithTagline ? 2.51 : 3.21;
  const imageWidth = Math.round(currentHeight * aspectRatio);

  return (
    <div className={`inline-flex flex-col select-none ${className}`}>
      <div 
        className="relative shrink-0 flex items-center" 
        style={{ height: currentHeight, width: imageWidth }}
      >
        <img
          src={imageSrc}
          alt={showFullLogoWithTagline ? "Voogyo — Simplify • Automate • Grow" : "Voogyo"}
          className="h-full w-auto object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        <span className="font-extrabold text-indigo-600 tracking-tight text-lg flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block animate-pulse"></span>
          VOOGYO
        </span>
      </div>
      {customTagline && (
        <span 
          className={`text-[9px] tracking-wider text-slate-400 font-medium uppercase mt-0.5 ${taglineClassName}`}
          style={{ letterSpacing: '0.12em' }}
        >
          {customTagline}
        </span>
      )}
    </div>
  );
}
