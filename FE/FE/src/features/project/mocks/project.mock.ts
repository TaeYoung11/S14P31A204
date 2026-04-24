import type { Project, ProjectMember } from '@/shared/types'

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'mock-project-1',
    name: '강남 근린생활시설',
    description: '서울 강남구 역삼동 근린생활시설 3층 설계 프로젝트',
    owner_id: 'mock-user-1',
    created_at: '2025-03-01T09:00:00Z',
    updated_at: '2025-04-10T14:30:00Z',
    member_count: 3,
    ifc_uploaded: true,
  },
  {
    id: 'mock-project-2',
    name: '성수동 오피스',
    description: '성수동 지식산업센터 내부 인테리어 설계',
    owner_id: 'mock-user-1',
    created_at: '2025-02-15T10:00:00Z',
    updated_at: '2025-04-05T16:00:00Z',
    member_count: 2,
    ifc_uploaded: false,
  },
  {
    id: 'mock-project-3',
    name: '마포 공동주택',
    description: '마포구 공덕동 30세대 공동주택 신축',
    owner_id: 'mock-user-1',
    created_at: '2025-01-20T08:00:00Z',
    updated_at: '2025-03-28T11:00:00Z',
    member_count: 4,
    ifc_uploaded: true,
  },
]

export const MOCK_MEMBERS: ProjectMember[] = [
  {
    id: 'mock-member-1',
    user: {
      id: 'mock-user-1',
      email: 'designer@batang.io',
      name: '김설계',
      user_type: 'DESIGNER',
      created_at: '2025-01-01T00:00:00Z',
    },
    role: 'DESIGNER',
    joined_at: '2025-03-01T09:00:00Z',
  },
  {
    id: 'mock-member-2',
    user: {
      id: 'mock-user-2',
      email: 'client@batang.io',
      name: '이건축주',
      user_type: 'CLIENT',
      created_at: '2025-01-05T00:00:00Z',
    },
    role: 'CLIENT',
    joined_at: '2025-03-05T09:00:00Z',
  },
]
