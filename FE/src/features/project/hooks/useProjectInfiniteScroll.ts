import { useEffect, useRef } from 'react'

interface UseProjectInfiniteScrollOptions {
  fetchNextPage: () => void
  hasNextPage?: boolean
  isFetchingNextPage: boolean
}

/** 목록 하단 sentinel을 감시해 다음 페이지 요청 타이밍만 관리합니다. */
export function useProjectInfiniteScroll({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: UseProjectInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  return sentinelRef
}
