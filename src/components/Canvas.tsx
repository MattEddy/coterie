import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  SelectionMode,
} from '@xyflow/react'
import type { Node, Edge, NodeChange, OnSelectionChangeParams } from '@xyflow/react'
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
  useEffect(() => {
    if (!user) return

    async function loadData() {
      const { data: objects } = await supabase
        .from('objects')
        .select(`
          id, class, name, title, status, phone, phone_2, email, website, address, photo_url, is_canon,
          objects_types(type_id),
          objects_overrides!inner(
            name, title, status, phone, phone_2, email, website, address, photo_url,
            map_x, map_y, shared_notes, private_notes, tags
          )
        `)
        .eq('objects_overrides.user_id', user!.id)
        .eq('is_active', true)

      if (!objects) return

      const flowNodes: Node[] = objects.map((obj, i) => {
        const override = obj.objects_overrides[0]
        const types = obj.objects_types?.map((t: { type_id: string }) => t.type_id) || []

        return {
          id: obj.id,
          type: 'object',
          position: {
            x: override?.map_x ?? (i % 5) * 250,
            y: override?.map_y ?? Math.floor(i / 5) * 200,
          },
          data: {
            id: obj.id,
            name: override?.name || obj.name,
            title: override?.title || obj.title,
            class: obj.class,
            status: override?.status || obj.status,
            types,
            phone: override?.phone || obj.phone,
            phone_2: override?.phone_2 || obj.phone_2,
            email: override?.email || obj.email,
            website: override?.website || obj.website,
            address: override?.address || obj.address,
            photo_url: override?.photo_url || obj.photo_url,
            shared_notes: override?.shared_notes,
            private_notes: override?.private_notes,
            tags: override?.tags,
          } satisfies ObjectNodeData,
        }
      })

      for (const n of flowNodes) {
        nodePositionsRef.current.set(n.id, n.position)
      }

      setNodes(flowNodes)

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
    }

    loadData()
  }, [user, setNodes, setEdges])

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

  // Single node click — handles single selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedItems([buildSelectedItem(node)])
    },
    [buildSelectedItem]
  )

  // Selection change handler — drives multi-selection UI (lasso, Cmd-click)
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      // Only use this for multi-selection (2+)
      // Single selection is handled by handleNodeClick
      if (selectedNodes.length >= 2) {
        setSelectedItems(selectedNodes.map(buildSelectedItem))
      }
    },
    [buildSelectedItem]
  )

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
    setSelectedItems([])
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
        onSelectionChange={handleSelectionChange}
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
        />
      )}

      {/* Level 2: Dual selection — two panels + highlighted edges between them */}
      {selectedItems.length === 2 && (
        <>
          <DetailPanel
            object={selectedItems[0].data}
            position={selectedItems[0].panelPos}
            onClose={clearSelection}
            peerObject={selectedItems[1].data}
          />
          <DetailPanel
            object={selectedItems[1].data}
            position={selectedItems[1].panelPos}
            onClose={clearSelection}
            peerObject={selectedItems[0].data}
          />
        </>
      )}

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
