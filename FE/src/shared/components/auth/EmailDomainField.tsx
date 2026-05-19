import { Check, ChevronDown } from 'lucide-react'

interface EmailDomainFieldProps<T extends string> {
  id: string
  localPart: string
  domain: string
  domainOptions: readonly T[]
  isCustomDomain: boolean
  isVerified?: boolean
  className?: string
  inputClassName?: string
  selectClassName?: string
  onLocalPartChange: (value: string) => void
  onDomainChange: (value: string) => void
  onSelectDomain: (domain: T | 'custom') => void
}

/** 이메일 아이디, 도메인 선택, 직접 입력 전환을 하나의 필드로 제공한다. */
export default function EmailDomainField<T extends string>({
  id,
  localPart,
  domain,
  domainOptions,
  isCustomDomain,
  isVerified = false,
  className = 'border-[#d1d5db]',
  inputClassName = 'text-[#111827] placeholder:text-[#9ca3af]',
  selectClassName = 'text-[#374151]',
  onLocalPartChange,
  onDomainChange,
  onSelectDomain,
}: EmailDomainFieldProps<T>) {
  return (
    <div className={`auth-email-field ${className}`}>
      <input
        id={id}
        type="text"
        className={`h-11 min-w-0 rounded-l-xl border-0 bg-transparent px-3 text-sm outline-none ${inputClassName}`}
        placeholder="아이디"
        value={localPart}
        onChange={(e) => onLocalPartChange(e.target.value)}
        required
        autoComplete="username"
      />
      <span className="inline-flex h-6 items-center border-x border-[#e5e7eb] px-2.5 text-[13px] font-semibold text-[#64748b]">
        @
      </span>
      {isCustomDomain ? (
        <div className="relative min-w-0">
          <input
            type="text"
            className={`h-11 w-full min-w-0 rounded-r-xl border-0 bg-transparent px-3 pr-14 text-sm font-medium outline-none placeholder:text-[#9ca3af] ${selectClassName}`}
            placeholder="example.com"
            value={domain}
            onChange={(e) => onDomainChange(e.target.value)}
            required
            autoComplete="off"
            aria-label="직접 입력 이메일 도메인"
          />
          {!isVerified && (
            <button
              type="button"
              onClick={() => onSelectDomain(domainOptions[0])}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#64748b] transition-colors hover:bg-[#f3f4f6] hover:text-[#4f46e5]"
              aria-label="도메인 선택으로 돌아가기"
            >
              선택
            </button>
          )}
        </div>
      ) : (
        <div className="relative min-w-0">
          <select
            className={`h-11 w-full min-w-0 appearance-none rounded-r-xl border-0 bg-transparent py-0 pl-3 pr-12 text-sm font-medium outline-none ${selectClassName}`}
            value={domain}
            onChange={(e) => onSelectDomain(e.target.value as T | 'custom')}
            aria-label="이메일 도메인 선택"
          >
            {domainOptions.map((domainOption) => (
              <option key={domainOption} value={domainOption}>
                {domainOption}
              </option>
            ))}
            <option value="custom">직접 입력</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
        </div>
      )}
      {isVerified && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#16a34a]">
          <Check className="h-5 w-5" />
        </span>
      )}
    </div>
  )
}
