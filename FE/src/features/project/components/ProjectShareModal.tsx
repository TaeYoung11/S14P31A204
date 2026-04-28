import { useEffect, useRef, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import { UserPlus, Check } from 'lucide-react'
import type { Project } from '@/shared/types'

interface ProjectShareModalProps {
  isOpen: boolean
  onClose: () => void
  projects: Project[]
  onInvite: (email: string) => Promise<void>
}

export default function ProjectShareModal({ isOpen, onClose, projects, onInvite }: ProjectShareModalProps) {
  const [email, setEmail] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isOpen) {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail('')
      setError('')
      setSuccess(false)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsPending(true)
    try {
      await onInvite(email)
      setSuccess(true)
      setEmail('')
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = window.setTimeout(() => {
        setSuccess(false)
        timeoutRef.current = null
      }, 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  const isBulkShare = projects.length > 1

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isBulkShare ? '선택 항목 공유' : '프로젝트 공유'}>
      {projects.length > 0 && (
        <div className="mb-4 rounded-md bg-[#f8f9fa] px-3 py-2">
          <p className="text-xs text-[#6b7280]">{isBulkShare ? '선택된 프로젝트' : '프로젝트'}</p>
          {isBulkShare ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium text-[#111827]">{projects.length}개 프로젝트를 초대합니다.</p>
              <div className="flex flex-wrap gap-1.5">
                {projects.slice(0, 4).map((project) => (
                  <span
                    key={project.id}
                    className="rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-xs font-medium text-[#374151]"
                  >
                    {project.name}
                  </span>
                ))}
                {projects.length > 4 && (
                  <span className="rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-xs font-medium text-[#6b7280]">
                    +{projects.length - 4}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-[#111827]">{projects[0].name}</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="mb-1.5 block text-xs font-medium text-[#374151]">
            초대할 이메일(CLIENT)
          </label>
          <div className="flex gap-2">
            <input
              id="invite-email"
              type="email"
              className="input-base flex-1"
              placeholder="client@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button
              id="invite-submit"
              type="submit"
              className="btn-primary flex shrink-0 items-center gap-1.5"
              disabled={isPending}
            >
              {isPending ? <Spinner size="sm" /> : success ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {success ? '완료' : '초대'}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-[#dc2626]">{error}</p>}
      </form>

      <p className="mt-4 text-xs text-[#9ca3af]">
        초대받은 CLIENT는 3D 뷰어 조회 및 댓글 작성에 참여할 수 있습니다.
      </p>
    </Modal>
  )
}
