
import React from 'react';

interface TranscriptionProps {
  userText: string;
  assistantText: string;
  isHistory?: boolean;
}

const Transcription: React.FC<TranscriptionProps> = ({ userText, assistantText, isHistory = false }) => {
  const containerClass = isHistory ? "opacity-40 scale-95" : "opacity-100 scale-100";
  
  return (
    <div className={`flex flex-col gap-6 w-full max-w-xl transition-all duration-500 ${containerClass}`}>
      {userText && (
        <div className="flex justify-end transform transition-transform">
          <div className="hologram-glass border border-blue-500/20 rounded-2xl px-6 py-3 text-sm max-w-[90%] glowing-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-blue-400 text-[9px] font-black uppercase tracking-[0.2em]">User Input</span>
            </div>
            <p className="text-white/90 leading-relaxed font-medium tracking-wide">{userText}</p>
          </div>
        </div>
      )}
      {assistantText && (
        <div className="flex justify-start transform transition-transform">
          <div className="hologram-glass border border-white/10 rounded-2xl px-6 py-3 text-sm max-w-[90%] glowing-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse"></div>
              <span className="text-white/40 text-[9px] font-black uppercase tracking-[0.2em]">Neural Response</span>
            </div>
            <p className="text-white leading-relaxed font-light tracking-wide italic">{assistantText}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transcription;
