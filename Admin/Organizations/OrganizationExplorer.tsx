
import React from 'react';

const OrganizationExplorer: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-10 text-center text-slate-400">
        <iconify-icon icon="mdi:domain-off" width="48" class="mb-4 opacity-50" />
        <h3 className="text-lg font-bold">Organization Feature Removed</h3>
        <p className="text-xs">This module has been deprecated. Please use the dashboard for personal workspace management.</p>
    </div>
  );
};

export default OrganizationExplorer;
