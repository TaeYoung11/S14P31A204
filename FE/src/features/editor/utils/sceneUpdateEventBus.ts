import type { SceneUpdateEvent } from '../types'

export type SceneUpdateEventListener = (event: SceneUpdateEvent) => void

export interface SceneUpdateEventBus {
  publish: (event: SceneUpdateEvent) => void
  subscribe: (listener: SceneUpdateEventListener) => () => void
}

export const createSceneUpdateEventBus = (): SceneUpdateEventBus => {
  const listeners = new Set<SceneUpdateEventListener>()

  return {
    publish(event) {
      listeners.forEach((listener) => listener(event))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
