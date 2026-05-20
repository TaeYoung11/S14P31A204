import { useRef, useState } from 'react'
import type { Project } from '@/shared/types'

interface UseProjectSiteCreationFlowOptions {
  deleteProjectById: (projectId: string) => Promise<unknown>
  navigateToEditor: (projectId: string, query?: string) => void
  setCurrentProject: (project: Project) => void
}

/** 프로젝트 생성 직후 사이트 입력 모달과 취소 보상 처리를 관리합니다. */
export function useProjectSiteCreationFlow({
  deleteProjectById,
  navigateToEditor,
  setCurrentProject,
}: UseProjectSiteCreationFlowOptions) {
  const [siteProject, setSiteProject] = useState<Project | null>(null)
  const [shouldShowSiteProjectOnboarding, setShouldShowSiteProjectOnboarding] = useState(false)
  const [isCancellingSiteProject, setIsCancellingSiteProject] = useState(false)
  const [siteCancelErrorMessage, setSiteCancelErrorMessage] = useState('')
  const isCancellingSiteProjectRef = useRef(false)

  /** 프로젝트 생성 성공 후 사이트 입력 모달을 열고 에디터 온보딩 요청 상태를 준비합니다. */
  const openSiteModalForProject = (project: Project) => {
    setSiteCancelErrorMessage('')
    setShouldShowSiteProjectOnboarding(true)
    setSiteProject(project)
  }

  /** 사이트 정보 입력을 완료하면 새 프로젝트를 현재 프로젝트로 지정하고 편집 화면으로 이동합니다. */
  const completeSiteModal = () => {
    if (siteProject) {
      setCurrentProject(siteProject)
      const onboardingQuery = shouldShowSiteProjectOnboarding ? '?onboarding=project-canvas' : ''
      navigateToEditor(siteProject.id, onboardingQuery)
    }
    setSiteCancelErrorMessage('')
    setShouldShowSiteProjectOnboarding(false)
    setSiteProject(null)
  }

  /**
   * 사이트 입력 없이 모달을 닫으면 방금 생성한 프로젝트를 즉시 삭제합니다.
   * "사이트 미입력 프로젝트 생성 불가" 정책을 보장하는 보상 처리입니다.
   */
  const cancelSiteModal = async () => {
    if (!siteProject) {
      setSiteCancelErrorMessage('생성 취소 대상 프로젝트를 찾을 수 없습니다. 새로 시도해주세요.')
      return
    }
    if (isCancellingSiteProjectRef.current) {
      setSiteCancelErrorMessage('프로젝트 생성 취소를 처리 중입니다. 잠시만 기다려주세요.')
      return
    }
    isCancellingSiteProjectRef.current = true
    setIsCancellingSiteProject(true)
    setSiteCancelErrorMessage('')
    try {
      await deleteProjectById(siteProject.id)
      setSiteCancelErrorMessage('')
      setShouldShowSiteProjectOnboarding(false)
      setSiteProject(null)
    } catch (error) {
      if (error instanceof Error && error.message.trim().length > 0) {
        setSiteCancelErrorMessage(error.message)
      } else {
        setSiteCancelErrorMessage('프로젝트 생성 취소 처리에 실패했습니다. 다시 시도해주세요.')
      }
    } finally {
      isCancellingSiteProjectRef.current = false
      setIsCancellingSiteProject(false)
    }
  }

  /** 사이트 모달 취소 오류 메시지를 사용자 입력 이벤트에 맞춰 초기화합니다. */
  const clearSiteCancelErrorMessage = () => {
    setSiteCancelErrorMessage('')
  }

  return {
    cancelSiteModal,
    clearSiteCancelErrorMessage,
    completeSiteModal,
    isCancellingSiteProject,
    openSiteModalForProject,
    siteCancelErrorMessage,
    siteProject,
  }
}
