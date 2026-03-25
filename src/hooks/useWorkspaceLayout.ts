import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const LOCAL_KEY = 'coterie-workspace-layout'

interface FrameLayout {
  x: number
  y: number
  w: number
  h: number | null
}

type WorkspaceLayout = Record<string, FrameLayout>

// In-memory cache shared across all hook instances
let layoutCache: WorkspaceLayout = {}
let cacheLoaded = false

function readLocal(): WorkspaceLayout {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function writeLocal(layout: WorkspaceLayout) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(layout))
}

export function useWorkspaceLayout() {
  const { user } = useAuth()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load from localStorage on first use, hydrate from Supabase
  useEffect(() => {
    if (cacheLoaded || !user) return

    // Instant: load from localStorage
    layoutCache = readLocal()
    cacheLoaded = true

    // Background: hydrate from Supabase (source of truth)
    supabase
      .from('profiles')
      .select('workspace_layout')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.workspace_layout && Object.keys(data.workspace_layout).length > 0) {
          layoutCache = data.workspace_layout as WorkspaceLayout
          writeLocal(layoutCache)
        }
      })
  }, [user])

  const getLayout = useCallback((key: string): FrameLayout | null => {
    return layoutCache[key] ?? null
  }, [])

  const saveLayout = useCallback((key: string, layout: FrameLayout) => {
    layoutCache[key] = layout
    writeLocal(layoutCache)

    // Debounce Supabase write (500ms)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!user) return
      supabase
        .from('profiles')
        .update({ workspace_layout: layoutCache })
        .eq('user_id', user.id)
        .then()
    }, 500)
  }, [user])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  return { getLayout, saveLayout }
}
