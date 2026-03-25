import { createContext, useContext, type ReactNode } from 'react'
import { useWorkspaceLayout } from '../hooks/useWorkspaceLayout'

interface FrameLayout {
  x: number
  y: number
  w: number
  h: number | null
}

interface WorkspaceContextValue {
  getLayout: (key: string) => FrameLayout | null
  saveLayout: (key: string, layout: FrameLayout) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  getLayout: () => null,
  saveLayout: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceLayout()
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
