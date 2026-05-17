/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useProjectListPage } from '@/features/project/hooks/useProjectListPage'

const navigateMock = vi.fn()
const setCurrentProjectMock = vi.fn()

const createProjectMutateMock = vi.fn()
const updateProjectMutateMock = vi.fn()
const deleteProjectMutateAsyncMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Tester', email: 'test@example.com', user_type: 'DESIGNER' },
    logout: vi.fn(),
    withdraw: vi.fn(),
    withdrawError: null,
    isWithdrawing: false,
  }),
}))

vi.mock('@/features/project/stores/projectStore', () => ({
  useProjectStore: (selector: (state: { setCurrentProject: typeof setCurrentProjectMock }) => unknown) => selector({
    setCurrentProject: setCurrentProjectMock,
  }),
}))

vi.mock('@/features/project/hooks/useProjects', () => ({
  useProjects: () => ({
    data: { pages: [] },
    isLoading: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
  }),
  useAllProjects: () => ({
    data: [],
    isLoading: false,
  }),
  useCreateProject: () => ({
    mutate: createProjectMutateMock,
    isPending: false,
  }),
  useUpdateProject: () => ({
    mutate: updateProjectMutateMock,
    isPending: false,
  }),
  useDeleteProject: () => ({
    mutateAsync: deleteProjectMutateAsyncMock,
    isPending: false,
  }),
}))

vi.mock('@/features/project/hooks/useProjectComments', () => ({
  useProjectComments: () => ({
    data: [],
    isLoading: false,
  }),
}))

vi.mock('@/features/project/hooks/useProjectCommentRealtime', () => ({
  useProjectCommentRealtime: () => ({
    toast: null,
    dismissToast: vi.fn(),
  }),
}))

vi.mock('@/features/project/hooks/useInvitation', () => ({
  useInvitationNotifications: () => ({
    data: [],
  }),
}))

interface HarnessProps {
  onReady: (value: ReturnType<typeof useProjectListPage>) => void
}

function Harness({ onReady }: HarnessProps) {
  const value = useProjectListPage()

  useEffect(() => {
    onReady(value)
  }, [onReady, value])

  return null
}

describe('useProjectListPage', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown
  let latestValue: ReturnType<typeof useProjectListPage> | null

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestValue = null

    navigateMock.mockReset()
    setCurrentProjectMock.mockReset()
    createProjectMutateMock.mockReset()
    updateProjectMutateMock.mockReset()
    deleteProjectMutateAsyncMock.mockReset()
    createProjectMutateMock.mockImplementation(
      (
        _payload: { name: string; description: string },
        options?: { onSuccess?: (project: { id: string; name: string }) => void },
      ) => {
        options?.onSuccess?.({ id: 'project-1', name: '새 프로젝트' })
      },
    )
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    latestValue = null
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironmentFlag
    vi.clearAllMocks()
  })

  it('취소 대상 프로젝트가 없으면 안내 메시지를 설정한다', async () => {
    act(() => {
      root.render(<Harness onReady={(value) => { latestValue = value }} />)
    })

    await act(async () => {
      await latestValue?.onCancelSiteModal()
    })

    expect(latestValue?.siteCancelErrorMessage).toBe('생성 취소 대상 프로젝트를 찾을 수 없습니다. 새로 시도해주세요.')
  })

  it('취소 요청이 이미 진행 중이면 중복 요청 안내 메시지를 설정한다', async () => {
    let resolveDelete: (() => void) | null = null
    deleteProjectMutateAsyncMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolveDelete = resolve }),
    )

    act(() => {
      root.render(<Harness onReady={(value) => { latestValue = value }} />)
    })

    act(() => {
      latestValue?.handleCreateSubmit({ name: '프로젝트', description: '설명' })
    })

    await act(async () => {
      void latestValue?.onCancelSiteModal()
      await Promise.resolve()
    })

    await act(async () => {
      await latestValue?.onCancelSiteModal()
    })

    expect(latestValue?.siteCancelErrorMessage).toBe('프로젝트 생성 취소를 처리 중입니다. 잠시만 기다려주세요.')

    await act(async () => {
      resolveDelete?.()
      await Promise.resolve()
    })
  })

  it('취소 삭제가 실패하면 실패 메시지를 설정한다', async () => {
    deleteProjectMutateAsyncMock.mockRejectedValueOnce(new Error('삭제 실패'))

    act(() => {
      root.render(<Harness onReady={(value) => { latestValue = value }} />)
    })

    act(() => {
      latestValue?.handleCreateSubmit({ name: '프로젝트', description: '설명' })
    })

    await act(async () => {
      await latestValue?.onCancelSiteModal()
    })

    expect(latestValue?.siteCancelErrorMessage).toBe('삭제 실패')
  })

  it('취소 삭제가 실패한 뒤 재시도 성공 시 에러를 지우고 모달 대상을 정리한다', async () => {
    deleteProjectMutateAsyncMock
      .mockRejectedValueOnce(new Error('삭제 실패'))
      .mockResolvedValueOnce(undefined)

    act(() => {
      root.render(<Harness onReady={(value) => { latestValue = value }} />)
    })

    act(() => {
      latestValue?.handleCreateSubmit({ name: '프로젝트', description: '설명' })
    })

    await act(async () => {
      await latestValue?.onCancelSiteModal()
    })

    expect(latestValue?.siteCancelErrorMessage).toBe('삭제 실패')
    expect(latestValue?.siteProject).not.toBeNull()

    await act(async () => {
      await latestValue?.onCancelSiteModal()
    })

    expect(deleteProjectMutateAsyncMock).toHaveBeenCalledTimes(2)
    expect(latestValue?.siteCancelErrorMessage).toBe('')
    expect(latestValue?.siteProject).toBeNull()
  })
})
