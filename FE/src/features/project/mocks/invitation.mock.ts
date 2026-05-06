import type { UserSearchResult, InvitationNotification } from '@/features/project/services/invitation.service'

export const MOCK_INVITE_USERS: UserSearchResult[] = [
  { userId: 'mock-user-10', name: '김민준', email: 'minjun.kim@architecture.kr' },
  { userId: 'mock-user-11', name: '이서연', email: 'seoyeon.lee@studio-base.com' },
  { userId: 'mock-user-12', name: '박지훈', email: 'jihoon.p@design-works.co' },
  { userId: 'mock-user-13', name: '최윤아', email: 'yuna.choi@batang.com' },
]

export const MOCK_INVITE_NOTIFICATIONS: InvitationNotification[] = [
  {
    notificationId: 'noti-001',
    isRead: false,
    title: '프로젝트 초대',
    body: "김설계 설계자가 '강남 근린생활시설' 프로젝트에 초대했습니다.",
    projectId: 'mock-project-1',
    projectName: '강남 근린생활시설',
    role: 'REPRESENTATIVE_CUSTOMER',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    notificationId: 'noti-002',
    isRead: false,
    title: '프로젝트 초대',
    body: "김설계 설계자가 '성수동 오피스' 프로젝트에 초대했습니다.",
    projectId: 'mock-project-2',
    projectName: '성수동 오피스',
    role: 'CUSTOMER',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
]
