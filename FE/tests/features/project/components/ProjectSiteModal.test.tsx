/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ProjectSiteModal from '@/features/project/components/ProjectSiteModal'
import { useProjectSiteModal } from '@/features/project/hooks/useProjectSiteModal'

vi.mock('@/features/project/hooks/useProjectSiteModal', () => ({
  useProjectSiteModal: vi.fn(),
}))

vi.mock('@/features/project/hooks/useProjectSiteModalActions', () => ({
  useProjectSiteModalActions: vi.fn(() => ({
    handleRequestClose: vi.fn(),
    handleComplete: vi.fn(),
  })),
}))

vi.mock('@/features/project/components/site-modal/ProjectSitePolygonPreviewCard', () => ({
  ProjectSitePolygonPreviewCard: () => <div data-testid="polygon-preview-card" />,
}))

vi.mock('@/features/project/components/site-modal/ProjectSitePostcodeOverlay', () => ({
  ProjectSitePostcodeOverlay: () => null,
}))

vi.mock('@/features/project/components/site-modal/ProjectSiteCreateAction', () => ({
  ProjectSiteCreateAction: ({ isProcessing }: { isProcessing: boolean }) => (
    <button type="button" disabled={isProcessing}>
      프로젝트 생성
    </button>
  ),
}))

type UseProjectSiteModalResult = ReturnType<typeof useProjectSiteModal>

function createUseProjectSiteModalMock(
  override: Partial<UseProjectSiteModalResult> = {},
): UseProjectSiteModalResult {
  return {
    mapContainerRef: { current: null },
    showPostcode: false,
    setShowPostcode: vi.fn(),
    selectedAddress: '',
    polygonCoords: null,
    siteAreaM2: null,
    siteAreaPyeong: null,
    sdkError: '',
    searchError: '',
    registerError: null,
    isRegistering: false,
    handleAddressSelect: vi.fn(),
    ...override,
  }
}

describe('ProjectSiteModal', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironmentFlag
  })

  it('대지 폴리곤이 없으면 프로젝트 생성 버튼을 렌더링하지 않는다', () => {
    vi.mocked(useProjectSiteModal).mockReturnValue(
      createUseProjectSiteModalMock({ polygonCoords: null }),
    )

    act(() => {
      root.render(
        <ProjectSiteModal
          isOpen
          projectId="project-1"
          onComplete={vi.fn()}
          onCancel={vi.fn()}
        />,
      )
    })

    const createButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '프로젝트 생성')

    expect(createButton).toBeUndefined()
  })

  it('취소 실패 메시지가 있으면 모달에 에러 메시지를 노출한다', () => {
    vi.mocked(useProjectSiteModal).mockReturnValue(
      createUseProjectSiteModalMock(),
    )

    act(() => {
      root.render(
        <ProjectSiteModal
          isOpen
          projectId="project-1"
          onComplete={vi.fn()}
          onCancel={vi.fn()}
          cancelErrorMessage="프로젝트 생성 취소 처리에 실패했습니다."
        />,
      )
    })

    expect(container.textContent).toContain('프로젝트 생성 취소 처리에 실패했습니다.')
  })

  it('취소/저장 처리 중에는 주소 검색 오버레이를 강제로 닫는다', () => {
    const setShowPostcode = vi.fn()
    vi.mocked(useProjectSiteModal).mockReturnValue(
      createUseProjectSiteModalMock({
        showPostcode: true,
        setShowPostcode,
      }),
    )

    act(() => {
      root.render(
        <ProjectSiteModal
          isOpen
          projectId="project-1"
          onComplete={vi.fn()}
          onCancel={vi.fn()}
          isCancellingProject
        />,
      )
    })

    expect(setShowPostcode).toHaveBeenCalledWith(false)
  })

  it('주소 검색을 다시 시작하면 이전 취소 오류 메시지를 초기화한다', () => {
    vi.mocked(useProjectSiteModal).mockReturnValue(
      createUseProjectSiteModalMock(),
    )
    const onClearCancelError = vi.fn()

    act(() => {
      root.render(
        <ProjectSiteModal
          isOpen
          projectId="project-1"
          onComplete={vi.fn()}
          onCancel={vi.fn()}
          cancelErrorMessage="프로젝트 생성 취소 처리에 실패했습니다."
          onClearCancelError={onClearCancelError}
        />,
      )
    })

    const searchButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '주소 검색')
    expect(searchButton).not.toBeUndefined()

    act(() => {
      searchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onClearCancelError).toHaveBeenCalledTimes(1)
  })
})
