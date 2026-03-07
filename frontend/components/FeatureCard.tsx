import React from 'react';
import { FeatureCardProps } from '../app/types';

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, icon, techSpec, delay = 0 }) => {
  return (
    <div 
        className="group relative bg-cyber-dark border border-neon-900/50 p-6 hover:border-neon-500 transition-all duration-300 overflow-hidden"
        style={{ animationDelay: `${delay}ms` }}
    >
      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-neon-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      {/* Corner Markers */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-neon-500 opacity-50"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-neon-500 opacity-50"></div>

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-neon-900/20 rounded border border-neon-900/50 text-neon-500 group-hover:text-neon-400 group-hover:border-neon-500 transition-colors">
                {icon}
            </div>
            <span className="text-[10px] text-neon-800 font-mono border border-neon-900 px-1 py-0.5">{techSpec}</span>
        </div>
        
        <h3 className="text-xl font-sans font-bold text-white mb-2 group-hover:text-neon-300 transition-colors">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed font-mono">{description}</p>
      </div>
      
      {/* Animated Scanline on hover */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-neon-500 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
    </div>
  );
};

export default FeatureCard;