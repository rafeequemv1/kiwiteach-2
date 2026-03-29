import '../../types';
import React, { useMemo } from 'react';
import TestDashboard from '../Test/TestDashboard';

interface OnlineExamDashboardProps {
  username?: string;
  institutesList: any[];
  classesList: any[];
  folders: any[];
  allTests: any[];
  onAddFolder: (folder: { name: string; parent_id: string | null }) => void;
  onStartNewExam: (folderId: string | null) => void;
  onTestClick: (test: any) => void;
  onDeleteItem: (type: 'folder' | 'test', id: string, name: string) => void;
  onDuplicateTest: (test: any) => void;
  onRenameTest: (testId: string, newName: string) => void;
  onScheduleTest: (testId: string, date: string | null) => void;
  onAssignClasses: (testId: string, classIds: string[]) => Promise<void>;
  onMoveTestToFolder?: (testId: string, folderId: string | null) => Promise<void>;
  onSetEvaluationPending?: (testId: string, pending: boolean) => Promise<void>;
  onRevertTestToDraft?: (testId: string) => Promise<void>;
  viewMode: 'icons' | 'list' | 'calendar' | 'kanban';
  setViewMode: (mode: 'icons' | 'list' | 'calendar' | 'kanban') => void;
  calendarType: 'month' | 'week' | 'year';
  setCalendarType: (type: 'month' | 'week' | 'year') => void;
}

const OnlineExamDashboard: React.FC<OnlineExamDashboardProps> = (props) => {
  const onlineExams = useMemo(() => props.allTests.filter((t) => t.config?.mode === 'online'), [props.allTests]);

  return (
    <TestDashboard
      {...props}
      title="Online tests"
      subtitle="Scheduled and deployed for your classes"
      primaryActionLabel="New test"
      allTests={onlineExams}
      onStartNewTest={props.onStartNewExam}
    />
  );
};

export default OnlineExamDashboard;
