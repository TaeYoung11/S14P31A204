interface ProjectMemberAvatarsProps {
  count: number
}

/** 프로젝트 카드 하단에 최대 3명의 참여자 요약 아바타를 표시한다. */
export default function ProjectMemberAvatars({ count }: ProjectMemberAvatarsProps) {
  return (
    <div className="flex items-center -space-x-1.5">
      {Array.from({ length: Math.min(count, 3) }).map((_, index) => (
        <div
          key={index}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#eef2ff]"
        >
          <span className="text-[10px] font-black text-[#4f46e5]">
            {String.fromCharCode(65 + index)}
          </span>
        </div>
      ))}
    </div>
  )
}
