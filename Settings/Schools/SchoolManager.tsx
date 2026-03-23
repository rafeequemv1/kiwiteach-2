import React from 'react';
import BusinessOrgPanel from '../Institutes/BusinessOrgPanel';

type SchoolManagerProps = {
  userId: string;
  onRefresh?: () => void;
  embedded?: boolean;
};

/** Compatibility wrapper for settings-level institute management (no business section). */
const SchoolManager: React.FC<SchoolManagerProps> = ({ userId, onRefresh, embedded }) => {
  return (
    <BusinessOrgPanel
      userId={userId}
      onRefresh={onRefresh}
      embedded={embedded}
      mode="settings"
      title="Institutes"
      subtitle="Institutes, classes, and student counts"
    />
  );
};

export default SchoolManager;
