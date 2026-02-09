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
import styles from './Canvas.module.css'

const nodeTypes = { object: ObjectNode }

const NODE_WIDTH = 180
const NODE_HEIGHT = 60

interface SelectedItem {
  nodeId: string
  data: ObjectNodeData
  panelPos: { x: number; y: number }
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

function getCentroid(items: SelectedItem[]): { x: number; y: number } {
  const sumX = items.reduce((acc, item) => acc + item.panelPos.x, 0)
  const sumY = items.reduce((acc, item) => acc + item.panelPos.y, 0)
  return { x: sumX / items.length, y: sumY / items.length }
}

const PANEL_WIDTH = 280
const PANEL_HEIGHT_EST = 300 // conservative estimate for overlap detection
const PANEL_OFFSET = 12
const PANEL_GAP = 8

function avoidPanelOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number }
): [{ x: number; y: number }, { x: number; y: number }] {
  const ax = a.x + PANEL_OFFSET
  const bx = b.x + PANEL_OFFSET
  const overlapsX = ax < bx + PANEL_WIDTH && ax + PANEL_WIDTH > bx
  const overlapsY = a.y < b.y + PANEL_HEIGHT_EST && a.y + PANEL_HEIGHT_EST > b.y

  if (overlapsX && overlapsY) {
    // Push the lower panel below the upper one
    if (a.y <= b.y) {
      return [a, { x: b.x, y: a.y + PANEL_HEIGHT_EST + PANEL_GAP }]
    } else {
      return [{ x: a.x, y: b.y + PANEL_HEIGHT_EST + PANEL_GAP }, b]
    }
  }
  return [a, b]
}

function CanvasInner() {
  const { user } = useAuth()
  const { flowToScreenPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const connectionsRef = useRef<{ id: string; source_id: string; target_id: string; type: string }[]>([])
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

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

  // Highlight edges between two selected nodes
  useEffect(() => {
    if (selectedItems.length === 2) {
      const idA = selectedItems[0].nodeId
      const idB = selectedItems[1].nodeId

      const betweenIds = new Set(
        connectionsRef.current
          .filter(c =>
            (c.source_id === idA && c.target_id === idB) ||
            (c.source_id === idB && c.target_id === idA)
          )
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

    if (!objects) return

    const flowNodes: Node[] = objects.map((obj, i) => ({
      id: obj.id,
      type: 'object',
      position: {
        x: obj.map_x ?? (i % 5) * 250,
        y: obj.map_y ?? Math.floor(i / 5) * 200,
      },
      data: {
        id: obj.id,
        name: obj.name,
        title: obj.title,
        class: obj.class,
        status: obj.status,
        types: obj.types || [],
        phone: obj.phone,
        phone_2: obj.phone_2,
        email: obj.email,
        website: obj.website,
        address: obj.address,
        photo_url: obj.photo_url,
        shared_notes: obj.shared_notes,
        private_notes: obj.private_notes,
        tags: obj.tags,
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
        if (freshNode) return { ...item, data: freshNode.data as unknown as ObjectNodeData }
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

  // Build SelectedItem from a node
  const buildSelectedItem = useCallback(
    (node: Node): SelectedItem => {
      const screenPos = flowToScreenPosition({
        x: node.position.x + NODE_WIDTH,
        y: node.position.y,
      })
      return {
        nodeId: node.id,
        data: node.data as unknown as ObjectNodeData,
        panelPos: screenPos,
      }
    },
    [flowToScreenPosition]
  )

  // Flag: when onNodeClick handles selection, tell useOnSelectionChange to stand down
  const clickHandledRef = useRef(false)

  // Click-based selection: normal click replaces, Cmd/Shift-click toggles
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      clickHandledRef.current = true
      setTimeout(() => { clickHandledRef.current = false }, 50)

      if (event.metaKey || event.shiftKey) {
        setSelectedItems(prev => {
          const exists = prev.find(item => item.nodeId === node.id)
          if (exists) return prev.filter(item => item.nodeId !== node.id)
          return [...prev, buildSelectedItem(node)]
        })
      } else {
        setSelectedItems([buildSelectedItem(node)])
      }
    },
    [buildSelectedItem]
  )

  // Lasso selection + pane deselection (click-based selection handled above)
  useOnSelectionChange({
    onChange: useCallback(
      ({ nodes: selectedNodes }: { nodes: Node[] }) => {
        if (clickHandledRef.current) return
        if (selectedNodes.length === 0) {
          setSelectedItems([])
          return
        }
        setSelectedItems(selectedNodes.map(buildSelectedItem))
      },
      [buildSelectedItem]
    ),
  })

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

  const handlePaneClick = useCallback(() => {
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
  }, [setEdges])

  const clearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  return (
    <div className={styles.container}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
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
          object={selectedItems[0].data}
          position={selectedItems[0].panelPos}
          onClose={clearSelection}
          onObjectUpdated={refreshData}
        />
      )}

      {/* Level 2: Dual selection — two panels + highlighted edges between them */}
      {selectedItems.length === 2 && (() => {
        const [pos0, pos1] = avoidPanelOverlap(selectedItems[0].panelPos, selectedItems[1].panelPos)
        return (
          <>
            <DetailPanel
              object={selectedItems[0].data}
              position={pos0}
              onClose={clearSelection}
              onObjectUpdated={refreshData}
              peerObject={selectedItems[1].data}
            />
            <DetailPanel
              object={selectedItems[1].data}
              position={pos1}
              onClose={clearSelection}
              onObjectUpdated={refreshData}
              peerObject={selectedItems[0].data}
            />
          </>
        )
      })()}

      {/* Level 3: Multi selection (3+) */}
      {selectedItems.length >= 3 && (
        <MultiSelectPanel
          items={selectedItems}
          position={getCentroid(selectedItems)}
          onClose={clearSelection}
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
