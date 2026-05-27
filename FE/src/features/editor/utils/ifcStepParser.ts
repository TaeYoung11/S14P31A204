import { decodeIfcStepString } from './ifcStepString'

export interface StepEntity {
  id: number
  type: string
  args: string[]
}

const ENTITY_HEADER_REGEX = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)$/i

const unquoteStepString = (token: string): string => {
  const trimmed = token.trim()
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return decodeIfcStepString(trimmed.slice(1, -1).replace(/''/g, "'"))
  }
  return decodeIfcStepString(trimmed)
}

export const parseStepRef = (token: string): number | null => {
  const match = token.trim().match(/^#(\d+)$/)
  return match ? Number(match[1]) : null
}

export const parseStepNumber = (token: string): number | null => {
  const value = Number(token.trim())
  return Number.isFinite(value) ? value : null
}

export const parseStepString = (token: string): string | null => {
  const trimmed = token.trim()
  if (trimmed === '$' || trimmed === '*') return null
  return unquoteStepString(trimmed)
}

export const parseStepEnum = (token: string): string | null => {
  const trimmed = token.trim()
  const match = trimmed.match(/^\.(.+)\.$/)
  return match ? match[1] : null
}

const splitTopLevel = (text: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let current = ''

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = i + 1 < text.length ? text[i + 1] : ''

    if (ch === "'") {
      current += ch
      if (inString && next === "'") {
        current += next
        i += 1
        continue
      }
      inString = !inString
      continue
    }

    if (!inString) {
      if (ch === '(') depth += 1
      if (ch === ')') depth -= 1
      if (ch === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
    }

    current += ch
  }

  if (current.trim().length > 0) parts.push(current.trim())
  return parts
}

const extractEntityChunks = (content: string): string[] => {
  const chunks: string[] = []
  let collecting = false
  let current = ''

  const text = content.replace(/\r/g, '')
  const lines = text.split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.toUpperCase() === 'DATA;') {
      collecting = true
      continue
    }
    if (!collecting) continue
    if (line.toUpperCase().startsWith('ENDSEC')) break

    if (!current && !line.startsWith('#')) continue
    current += line
    if (line.endsWith(';')) {
      chunks.push(current.slice(0, -1))
      current = ''
    }
  }

  return chunks
}

export const parseStepRefList = (token: string): number[] => {
  const trimmed = token.trim()
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return []
  const inner = trimmed.slice(1, -1).trim()
  if (!inner) return []
  return splitTopLevel(inner)
    .map((item) => parseStepRef(item))
    .filter((value): value is number => value !== null)
}

export const parseStepEntities = (stepText: string): Map<number, StepEntity> => {
  const entities = new Map<number, StepEntity>()
  const chunks = extractEntityChunks(stepText)

  for (const chunk of chunks) {
    const match = chunk.match(ENTITY_HEADER_REGEX)
    if (!match) continue
    const id = Number(match[1])
    const type = match[2].toUpperCase()
    const argsRaw = match[3]
    const args = splitTopLevel(argsRaw)
    entities.set(id, { id, type, args })
  }

  return entities
}
