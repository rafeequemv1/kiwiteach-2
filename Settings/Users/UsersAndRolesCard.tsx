
import '../../types';
import React, { useState } from 'react';

// Mock data for demonstration purposes
const mockUsers = [
  { id: '1', name: 'You', email: 'rebecca.c@kiwiteach.com', role: 'Owner', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rebecca' },
  { id: '2', name: 'Jane Doe', email: 'jane.d@kiwiteach.com', role: 'Principal', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jane' },
  { id: '3', name: 'John Smith', email: 'john.s@kiwiteach.com', role: 'Teacher', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John' },
  { id: '4', name: 'Emily White', email: 'emily.w@kiwiteach.com', role: 'Teacher', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily' },
];

const UsersAndRolesCard: React.FC = () => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Teacher' | 'Principal' | 'Owner'>('Teacher');
  const [members, setMembers] = useState(mockUsers);

  const handleRoleChange = (userId: string, newRole: string) => {
    // In a real app, you would call an API here.
    alert(`Changing user ${userId} to role ${newRole}. (UI only)`);
    setMembers(members.map(m => m.id === userId ? { ...m, role: newRole } : m));
  };
  
  const handleRemoveUser = (userId: string, userName: string) => {
    if (userId === '1') {
      alert("You cannot remove yourself.");
      return;
    }
    if (confirm(`Are you sure you want to remove ${userName}?`)) {
      alert(`Removing user ${userName}. (UI only)`);
      setMembers(members.filter(m => m.id !== userId));
    }
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    alert(`Sending invite to ${inviteEmail} with role ${inviteRole}. (UI only)`);
    setInviteEmail('');
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
          <iconify-icon icon="mdi:account-group-outline" width="24"></iconify-icon>
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight">Users & Roles</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage your organization's team</p>
        </div>
      </div>

      {/* Invite Section */}
      <div className="space-y-4">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Invite New Member</label>
        <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Enter member's email address..."
            className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 focus:bg-white font-medium text-xs transition-all"
          />
          <div className="flex gap-3">
             <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 focus:bg-white font-bold text-xs transition-all appearance-none"
             >
                <option>Teacher</option>
                <option>Principal</option>
                <option>Owner</option>
             </select>
             <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-5 rounded-xl transition-all shadow-md shadow-emerald-600/10 disabled:opacity-50 flex items-center justify-center gap-2"
             >
                <iconify-icon icon="mdi:send-outline" width="16"></iconify-icon>
                <span>Invite</span>
             </button>
          </div>
        </form>
      </div>

      <div className="my-8 border-t border-slate-100"></div>

      {/* Members List */}
      <div className="space-y-4">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Team Members ({members.length})</label>
        <div className="space-y-2">
          {members.map(user => (
            <div key={user.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-slate-50/70 rounded-2xl border border-slate-100 gap-3">
              <div className="flex items-center gap-3">
                <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200" />
                <div>
                  <p className="font-bold text-sm text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-400 font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  disabled={user.role === 'Owner'}
                  className="w-full sm:w-auto bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500 font-bold text-xs transition-all appearance-none disabled:opacity-70 disabled:bg-slate-100"
                >
                  <option>Teacher</option>
                  <option>Principal</option>
                  <option>Owner</option>
                </select>
                <button 
                  onClick={() => handleRemoveUser(user.id, user.name)} 
                  disabled={user.role === 'Owner'}
                  className="p-2 bg-white text-slate-400 rounded-lg border border-slate-200 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <iconify-icon icon="mdi:trash-can-outline" width="16"></iconify-icon>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UsersAndRolesCard;
