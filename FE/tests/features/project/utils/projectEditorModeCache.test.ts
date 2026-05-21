/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildProjectEditorPath,
  readProjectEditorMode,
  resolveProjectEditorMode,
  saveProjectEditorMode,
} from '@/features/project/utils/projectEditorModeCache'

describe('projectEditorModeCache', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null before a project mode is saved', () => {
    expect(readProjectEditorMode('project-1')).toBeNull()
    expect(resolveProjectEditorMode('project-1')).toBe('bubble')
  })

  it('stores the last editor mode per project', () => {
    saveProjectEditorMode('project-1', '2d')
    saveProjectEditorMode('project-2', 'view')

    expect(readProjectEditorMode('project-1')).toBe('2d')
    expect(readProjectEditorMode('project-2')).toBe('view')
    expect(buildProjectEditorPath('project-2')).toBe('/projects/project-2/editor?mode=view')
  })
})
