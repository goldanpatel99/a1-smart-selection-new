import React from 'react';

interface DynamicSecurityWatermarkProps {
  studioName?: string;
  clientPhone?: string;
  className?: string;
  opacity?: number;
}

export const DynamicSecurityWatermark: React.FC<DynamicSecurityWatermarkProps> = ({
  studioName = 'NEPOLIAN CINEMATIC STUDIO',
  clientPhone,
  className = '',
  opacity = 0.22,
}) => {
  const watermarkText = studioName.toUpperCase();
  const phoneText = clientPhone ? ` • ${clientPhone}` : '';

  return (
    <div
      className={`absolute inset-0 pointer-events-none select-none overflow-hidden z-10 flex items-center justify-center ${className}`}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Diagonal Multi-Line Security Watermark Pattern (Anti-Screenshot Protection) */}
      <div
        className="w-[200%] h-[200%] -rotate-25 flex flex-col justify-around items-center opacity-80"
        style={{
          opacity: opacity,
        }}
      >
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="flex items-center gap-12 whitespace-nowrap text-white font-mono font-extrabold text-[10px] sm:text-xs tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          >
            <span>{watermarkText}</span>
            <span className="text-amber-400 font-sans text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40 border border-white/10">
              SELECTION PREVIEW{phoneText}
            </span>
            <span>{watermarkText}</span>
            <span className="text-[9px] text-rose-300">DO NOT SCREENSHOT</span>
            <span>{watermarkText}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
