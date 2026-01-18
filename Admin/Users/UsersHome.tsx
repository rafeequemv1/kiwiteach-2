import '../../types';
import React from 'react';

const UsersHome: React.FC = () => {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Team Management</h4>
            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Local Mode</span>
        </div>
        <div className="p-16 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
                <iconify-icon icon="mdi:account-lock-outline" width="40" className="text-slate-200"></iconify-icon>
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">Staff Directory Restricted</h3>
            <p className="text-xs font-medium text-slate-400 max-w-sm leading-relaxed">
                Staff management requires an active cloud synchronization. In Local Storage mode, only the primary root administrator account is accessible.
            </p>
        </div>
      </div>
      
      <div className="flex gap-4">
          <button className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/10">
              Invite Member
          </button>
          <button className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
              Access Logs
          </button>
      </div>
    </div>
  );
};

export default UsersHome;