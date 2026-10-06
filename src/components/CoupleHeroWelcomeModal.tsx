import React, { useState } from 'react';
import { WeddingEvent, User } from '../types';
import { Heart, Music, VolumeX, Sparkles, Calendar, Camera, ChevronRight, ShieldCheck } from 'lucide-react';
import { romanticAudio } from '../utils/romanticAudio';

interface CoupleHeroWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: WeddingEvent;
  photographer?: User;
}

export const CoupleHeroWelcomeModal: React.FC<CoupleHeroWelcomeModalProps> = ({
  isOpen,
  onClose,
  event,
  photographer,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!isOpen) return null;

  const toggleMusic = () => {
    const active = romanticAudio.toggle();
    setIsPlaying(active);
  };

  const handleEnterGallery = () => {
    onClose();
  };

  const studioName = photographer?.studioName || event.studioName || 'NEPOLIAN CINEMATIC STUDIO';
  const tagline = photographer?.studioTagline || 'Luxury Wedding Stories & Timeless Films';
  const coupleStory =
    event.coupleStory ||
    'Two souls with but a single thought, two hearts that beat as one. Welcoming you to cherish and hand-pick the most timeless memories of our sacred wedding celebrations.';

  const formattedDate = event.eventDate
    ? new Date(event.eventDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Special Wedding Day';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-500 overflow-y-auto">
      {/* Ambient background glow & particles */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-xl bg-gradient-to-b from-neutral-900/95 via-neutral-900 to-neutral-950 border border-amber-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl text-center overflow-hidden my-auto">
        {/* Top Gold Ornament Border */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        {/* Studio Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-950 border border-amber-500/30 text-amber-400 text-[11px] font-bold tracking-widest uppercase mb-6 shadow-inner">
          <Camera className="w-3.5 h-3.5 text-amber-400" />
          <span>{studioName}</span>
        </div>

        {/* Couple Title */}
        <div className="mb-4">
          <div className="flex items-center justify-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span>Sacred Wedding Gallery</span>
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-serif tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-white to-amber-200 py-1">
            {event.coupleName || event.title}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-2 font-mono flex items-center justify-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>{formattedDate}</span>
          </p>
        </div>

        {/* Romantic Story Quote */}
        <div className="relative my-6 px-4 py-4 rounded-2xl bg-neutral-950/70 border border-neutral-800/80 text-center">
          <Sparkles className="w-4 h-4 text-amber-400 mx-auto mb-2 opacity-70" />
          <p className="text-xs sm:text-sm italic text-neutral-300 font-serif leading-relaxed">
            "{coupleStory}"
          </p>
          <div className="w-12 h-0.5 bg-amber-500/40 mx-auto mt-3 rounded-full" />
        </div>

        {/* Music Ambient Player Control */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800/90 mb-6">
          <div className="flex items-center gap-3 text-left">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isPlaying
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {isPlaying ? <Music className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Wedding Ambient Melody</span>
                {isPlaying && (
                  <span className="flex items-center gap-0.5 h-3">
                    <span className="w-0.5 h-3 bg-amber-400 rounded-full animate-bounce" />
                    <span className="w-0.5 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-0.5 h-3.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400">
                {isPlaying ? 'Playing soothing acoustic wedding chords' : 'Tap to play background romantic music'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMusic}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isPlaying
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
                : 'bg-neutral-800 text-white hover:bg-neutral-700'
            }`}
          >
            {isPlaying ? 'Pause' : 'Play Music'}
          </button>
        </div>

        {/* Security & Watermark Assurance Badge */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 mb-6 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>High-Resolution Studio Preview • Select your album favorites</span>
        </div>

        {/* Enter Gallery Primary Button */}
        <button
          type="button"
          onClick={handleEnterGallery}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-extrabold text-sm sm:text-base shadow-xl shadow-amber-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group"
        >
          <span>Open Wedding Gallery (Photos Dekhein)</span>
          <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* White-Label Footer */}
        <p className="text-[11px] text-neutral-400 mt-4">
          {tagline}
        </p>
      </div>
    </div>
  );
};
