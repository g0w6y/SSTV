
import React from 'react';

interface HeaderProps {
  activeSession: 'RX' | 'TX' | 'HISTORY';
  onSessionChange: (session: 'RX' | 'TX' | 'HISTORY') => void;
}

const Header: React.FC<HeaderProps> = ({ activeSession, onSessionChange }) => {
  return (
    <header className="bg-black border-b border-white/10 py-6 px-12 flex justify-between items-center sticky top-0 z-50">
      <div className="flex items-center gap-6 group cursor-pointer" onClick={() => onSessionChange('RX')}>
        <div className="w-10 h-10 bg-white flex items-center justify-center transition-transform group-hover:scale-110">
          <i className="fas fa-crosshairs text-black text-lg"></i>
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-black tracking-tight text-white uppercase italic">SSTV VISION PRO</h1>
          <p className="text-[9px] text-white/30 uppercase tracking-[0.4em] font-bold">NExTQAT0R</p>
        </div>
      </div>
      <nav className="flex items-center gap-2">
        {[
          { id: 'RX', label: 'Receiver' },
          { id: 'TX', label: 'Transmitter' },
          { id: 'HISTORY', label: 'History' }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => onSessionChange(item.id as any)}
            className={`px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
              activeSession === item.id 
                ? 'bg-white text-black' 
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-2 border border-white/10 px-3 py-1">
           <div className="w-1 h-1 bg-white rounded-full"></div>
           <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">LOCKED</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
