import React from 'react';
import { Camera } from 'lucide-react';

interface DynamicSecurityWatermarkProps {
  studioName?: string;
  clientPhone?: string;
  className?: string;
  opacity?: number;
}

export const DynamicSecurityWatermark: React.FC<DynamicSecurityWatermarkProps> = ({
  studioName = 'STUDIO',
  className = '',
}) => {
  const watermarkText = (studioName || 'STUDIO').toUpperCase();

  return (
    <div
      className={`absolute bottom-2.5 right-2.5 pointer-events-none select-none z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white shadow-lg ${className}`}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <Camera className="w-3 h-3 text-amber-400 flex-shrink-0" />
      <span className="font-heading font-semibold text-[10px] tracking-wider uppercase text-neutral-200 truncate max-w-[150px]">
        {watermarkText}
      </span>
    </div>
  );
};
