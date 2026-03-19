import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  BackgroundVariant,
  SelectionMode,
} from '@xyflow/react'
import type { Node, Edge, NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ObjectNode from './ObjectNode'
import type { ObjectNodeData } from './ObjectNode'
import DetailPanel from './DetailPanel'
import MultiSelectPanel from './MultiSelectPanel'
import CreateObjectForm from './CreateObjectForm'
import styles from './Canvas.module.css'

const nodeTypes = { object: ObjectNode }

// Must match ObjectNode.module.css .card width/height
export const NODE_WIDTH = 180
export const NODE_HEIGHT = 60

interface SelectedItem {
  nodeId: string
  data: ObjectNodeData
}

function getNearestHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const dx = (targetPos.x + NODE_WIDTH / 2) - (sourcePos.x + NODE_WIDTH / 2)
  const dy = (targetPos.y + NODE_HEIGHT / 2) - (sourcePos.y + NODE_HEIGHT / 2)

  let sourceHandle: string
  let targetHandle: string

  if (Math.abs(dx) > Math.abs(dy)) {
    sourceHandle = dx > 0 ? 'right' : 'left'
    targetHandle = dx > 0 ? 'left' : 'right'
  } else {
    sourceHandle = dy > 0 ? 'bottom' : 'top'
    targetHandle = dy > 0 ? 'top' : 'bottom'
  }

  return { sourceHandle, targetHandle }
}

function CanvasInner() {
  const { user } = useAuth()
  const { flowToScreenPosition, screenToFlowPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const selectedItemsRef = useRef<SelectedItem[]>([])
  selectedItemsRef.current = selectedItems
  const connectionsRef = useRef<{ id: string; source_id: string; target_id: string; type: string }[]>([])
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [createForm, setCreateForm] = useState<{ screen: { x: number; y: number }; flow: { x: number; y: number } } | null>(null)

  const rebuildEdges = useCallback(() => {
    const flowEdges: Edge[] = connectionsRef.current.map(conn => {
      const srcPos = nodePositionsRef.current.get(conn.source_id) || { x: 0, y: 0 }
      const tgtPos = nodePositionsRef.current.get(conn.target_id) || { x: 0, y: 0 }
      const { sourceHandle, targetHandle } = getNearestHandles(srcPos, tgtPos)

      return {
        id: conn.id,
        source: conn.source_id,
        target: conn.target_id,
        sourceHandle,
        targetHandle,
        data: { connectionType: conn.type },
        style: { stroke: '#444', strokeWidth: 1.5 },
      }
    })
    setEdges(flowEdges)
  }, [setEdges])

  // Highlight all edges between selected nodes
  useEffect(() => {
    if (selectedItems.length >= 2) {
      const selectedIds = new Set(selectedItems.map(i => i.nodeId))

      const betweenIds = new Set(
        connectionsRef.current
          .filter(c => selectedIds.has(c.source_id) && selectedIds.has(c.target_id))
          .map(c => c.id)
      )

      if (betweenIds.size > 0) {
        setEdges(current =>
          current.map(e => {
            if (betweenIds.has(e.id)) {
              return {
                ...e,
                label: (e.data?.connectionType as string)?.replace(/_/g, ' ') || '',
                style: { stroke: '#fff', strokeWidth: 2.5 },
                labelStyle: { fontSize: 10, fill: '#fff' },
                labelBgStyle: { fill: 'var(--color-bg)', fillOpacity: 0.8 },
              }
            }
            return e
          })
        )
      }
    }
  }, [selectedItems, setEdges])

  // Load objects and connections from Supabase
  const refreshData = useCallback(async () => {
    if (!user) return

    const { data: objects } = await supabase
      .from('user_objects')
      .select('*')
      .eq('user_id', user.id)
      .in('class', ['company', 'person'])

    if (!objects) return

    // Preserve selected state so React Flow doesn't fire spurious selection changes
    const currentSelectedIds = new Set(selectedItemsRef.current.map(i => i.nodeId))

    const flowNodes: Node[] = objects.map((obj, i) => ({
      id: obj.id,
      type: 'object',
      position: {
        x: obj.map_x ?? (i % 5) * 250,
        y: obj.map_y ?? Math.floor(i / 5) * 200,
      },
      selected: currentSelectedIds.has(obj.id),
      data: {
        id: obj.id,
        name: obj.name,
        title: obj.title,
        class: obj.class,
        status: obj.status,
        types: obj.types || [],
        photo_url: obj.photo_url,
        data: obj.data,
        shared_notes: obj.shared_notes,
        private_notes: obj.private_notes,
        tags: obj.tags,
        is_canon: obj.is_canon,
        created_by: obj.created_by,
      } satisfies ObjectNodeData,
    }))

    for (const n of flowNodes) {
      nodePositionsRef.current.set(n.id, n.position)
    }

    setNodes(flowNodes)

    // Update selected items with fresh data
    setSelectedItems(prev =>
      prev.map(item => {
        const freshNode = flowNodes.find(n => n.id === item.nodeId)
        if (freshNode) return { nodeId: item.nodeId, data: freshNode.data as unknown as ObjectNodeData }
        return item
      })
    )

    const objectIds = objects.map(o => o.id)
    const { data: connections } = await supabase
      .from('connections')
      .select('id, source_id, target_id, type')
      .eq('is_active', true)
      .in('source_id', objectIds)
      .in('target_id', objectIds)

    if (connections) {
      connectionsRef.current = connections
      rebuildEdges()
    }
  }, [user, setNodes, rebuildEdges])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  // Save position on drag end + recalculate edge handles
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

      let needsEdgeRebuild = false
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          nodePositionsRef.current.set(change.id, change.position)
          needsEdgeRebuild = true
          if (!change.dragging) {
            supabase
              .from('objects_overrides')
              .update({ map_x: change.position.x, map_y: change.position.y })
              .eq('object_id', change.id)
              .eq('user_id', user!.id)
              .then()
          }
        }
      }

      if (needsEdgeRebuild) {
        rebuildEdges()
      }
    },
    [onNodesChange, user, rebuildEdges]
  )

  // Flag: when onNodeClick handles selection, tell useOnSelectionChange to stand down
  const clickHandledRef = useRef(false)
  // Track lasso selection so we can distinguish "lasso selected 1 node" from "mousedown on node"
  const isLassoRef = useRef(false)

  // Click-based selection: normal click replaces, Cmd/Shift-click toggles
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      clickHandledRef.current = true
      setTimeout(() => { clickHandledRef.current = false }, 50)

      const item: SelectedItem = { nodeId: node.id, data: node.data as unknown as ObjectNodeData }

      if (event.metaKey || event.shiftKey) {
        setSelectedItems(prev => {
          const exists = prev.find(i => i.nodeId === node.id)
          if (exists) return prev.filter(i => i.nodeId !== node.id)
          return [...prev, item]
        })
      } else {
        setSelectedItems([item])
      }
    },
    []
  )

  // Lasso selection + pane deselection
  // Single-node selection is handled by onNodeClick (mouseup), NOT here (mousedown).
  // This prevents the panel from opening when you start dragging a node.
  useOnSelectionChange({
    onChange: useCallback(
      ({ nodes: selectedNodes }: { nodes: Node[] }) => {
        if (clickHandledRef.current) return
        if (selectedNodes.length === 0) {
          setSelectedItems([])
          return
        }
        // Single-node from internal mousedown (not lasso) — skip, let onNodeClick handle it
        if (selectedNodes.length === 1 && !isLassoRef.current) return
        setSelectedItems(selectedNodes.map(n => ({
          nodeId: n.id,
          data: n.data as unknown as ObjectNodeData,
        })))
      },
      []
    ),
  })

  // Sync our selection state → React Flow's node.selected property
  // so ObjectNode's `selected` prop reflects our custom multi-selection
  useEffect(() => {
    const selectedIds = new Set(selectedItems.map(i => i.nodeId))
    setNodes(current => {
      let changed = false
      const next = current.map(n => {
        const shouldBeSelected = selectedIds.has(n.id)
        if (n.selected !== shouldBeSelected) {
          changed = true
          return { ...n, selected: shouldBeSelected }
        }
        return n
      })
      return changed ? next : current
    })
  }, [selectedItems, setNodes])

  // Handle edge selection — show label + turn white when selected
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setSelectedItems([])
      setEdges(current =>
        current.map(e => {
          if (e.id === edge.id) {
            return {
              ...e,
              label: (e.data?.connectionType as string)?.replace(/_/g, ' ') || '',
              style: { stroke: '#fff', strokeWidth: 2 },
              labelStyle: { fontSize: 10, fill: '#fff' },
              labelBgStyle: { fill: 'var(--color-bg)', fillOpacity: 0.8 },
            }
          }
          return {
            ...e,
            label: undefined,
            style: { stroke: '#444', strokeWidth: 1.5 },
            labelStyle: undefined,
            labelBgStyle: undefined,
          }
        })
      )
    },
    [setEdges]
  )

  // Detect double-click on pane via timing (React Flow v12 has no onPaneDoubleClick)
  const lastPaneClickRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 })

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    const now = Date.now()
    const last = lastPaneClickRef.current
    const dx = Math.abs(event.clientX - last.x)
    const dy = Math.abs(event.clientY - last.y)

    if (now - last.time < 400 && dx < 10 && dy < 10) {
      // Double-click detected
      lastPaneClickRef.current = { time: 0, x: 0, y: 0 }
      const screenPos = { x: event.clientX, y: event.clientY }
      const flowPos = screenToFlowPosition(screenPos)
      setSelectedItems([])
      setCreateForm({ screen: screenPos, flow: flowPos })
      return
    }

    lastPaneClickRef.current = { time: now, x: event.clientX, y: event.clientY }

    setCreateForm(null)
    // Selection clearing is handled by useOnSelectionChange — just reset edge styles
    setEdges(current =>
      current.map(e => ({
        ...e,
        label: undefined,
        style: { stroke: '#444', strokeWidth: 1.5 },
        labelStyle: undefined,
        labelBgStyle: undefined,
      }))
    )
  }, [setEdges, screenToFlowPosition])

  const handleCreateObject = useCallback(async (className: string, name: string) => {
    if (!user) return

    // 1. Skeleton objects row
    const { data: obj, error: objError } = await supabase
      .from('objects')
      .insert({ class: className, is_canon: false, created_by: user.id })
      .select('id')
      .single()

    if (objError || !obj) {
      console.error('Failed to create object:', objError)
      return
    }

    // 2. Override row with name + position
    const flowPos = createForm!.flow
    const { error: ovError } = await supabase
      .from('objects_overrides')
      .insert({
        object_id: obj.id,
        user_id: user.id,
        name,
        map_x: flowPos.x,
        map_y: flowPos.y,
      })

    if (ovError) {
      console.error('Failed to create override:', ovError)
      return
    }

    setCreateForm(null)
    await refreshData()

    // Auto-select the new node so the detail panel opens
    setSelectedItems([{
      nodeId: obj.id,
      data: {
        id: obj.id,
        name,
        title: null,
        class: className,
        status: null,
        types: [],
        photo_url: null,
        data: null,
        shared_notes: null,
        private_notes: null,
        tags: null,
        is_canon: false,
        created_by: user.id,
      },
    }])
  }, [user, createForm, refreshData])

  const clearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  // Dual selection: assign opposite sides so panels don't overlap
  const dualSides = selectedItems.length === 2 ? (() => {
    const posA = nodePositionsRef.current.get(selectedItems[0].nodeId)
    const posB = nodePositionsRef.current.get(selectedItems[1].nodeId)
    const aIsLeft = (posA?.x ?? 0) <= (posB?.x ?? 0)
    return [aIsLeft ? 'left' : 'right', aIsLeft ? 'right' : 'left'] as const
  })() : null

  // Multi-select: position panel beside the bounding box of all selected nodes
  const MULTI_PANEL_WIDTH = 220
  const multiSelectPosition = selectedItems.length >= 3
    ? (() => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const item of selectedItems) {
          const pos = nodePositionsRef.current.get(item.nodeId) || { x: 0, y: 0 }
          const tl = flowToScreenPosition(pos)
          const br = flowToScreenPosition({ x: pos.x + NODE_WIDTH, y: pos.y + NODE_HEIGHT })
          minX = Math.min(minX, tl.x)
          minY = Math.min(minY, tl.y)
          maxX = Math.max(maxX, br.x)
          maxY = Math.max(maxY, br.y)
        }
        const vw = window.innerWidth
        const left = (vw - maxX) >= minX
          ? maxX + 12
          : minX - MULTI_PANEL_WIDTH - 12
        return { x: Math.max(12, Math.min(left, vw - MULTI_PANEL_WIDTH - 12)), y: (minY + maxY) / 2 }
      })()
    : { x: 0, y: 0 }

  return (
    <div className={styles.container}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onSelectionStart={() => { isLassoRef.current = true }}
        onSelectionEnd={() => { setTimeout(() => { isLassoRef.current = false }, 50) }}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        zoomOnDoubleClick={false}
        panOnScroll
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        zoomOnScroll
        zoomOnPinch
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Meta"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#222" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Level 1: Single selection */}
      {selectedItems.length === 1 && (
        <DetailPanel
          nodeId={selectedItems[0].nodeId}
          object={selectedItems[0].data}
          onClose={clearSelection}
          onObjectUpdated={refreshData}
        />
      )}

      {/* Level 2: Dual selection — panels on opposite sides */}
      {selectedItems.length === 2 && dualSides && (
        <>
          <DetailPanel
            nodeId={selectedItems[0].nodeId}
            object={selectedItems[0].data}
            onClose={clearSelection}
            onObjectUpdated={refreshData}
            peerObject={selectedItems[1].data}
            preferredSide={dualSides[0]}
          />
          <DetailPanel
            nodeId={selectedItems[1].nodeId}
            object={selectedItems[1].data}
            onClose={clearSelection}
            onObjectUpdated={refreshData}
            peerObject={selectedItems[0].data}
            preferredSide={dualSides[1]}
          />
        </>
      )}

      {/* Level 3: Multi selection (3+) */}
      {selectedItems.length >= 3 && (
        <MultiSelectPanel
          items={selectedItems}
          position={multiSelectPosition}
          onClose={clearSelection}
        />
      )}

      {/* Create object form (double-click on empty canvas) */}
      {createForm && (
        <CreateObjectForm
          screenPosition={createForm.screen}
          onSubmit={handleCreateObject}
          onCancel={() => setCreateForm(null)}
        />
      )}
    </div>
  )
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
