import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  BackgroundVariant,
  SelectionMode,
  ConnectionLineType,
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
import ConnectionRoleForm from './ConnectionRoleForm'
import RoleEdge from './RoleEdge'
import styles from './Canvas.module.css'

const nodeTypes = { object: ObjectNode }
const edgeTypes = { role: RoleEdge }

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

export interface CanvasRef {
  zoomToNode: (nodeId: string) => void
}

const CanvasInner = forwardRef<CanvasRef>(function CanvasInner(_, ref) {
  const { user } = useAuth()
  const { flowToScreenPosition, screenToFlowPosition, setCenter } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const selectedItemsRef = useRef<SelectedItem[]>([])
  selectedItemsRef.current = selectedItems
  const nodesRef = useRef<Node[]>([])
  nodesRef.current = nodes
  const connectionsRef = useRef<{ id: string; object_a_id: string; object_b_id: string; role_a: string | null; role_b: string | null; isUserCreated: boolean }[]>([])
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  useImperativeHandle(ref, () => ({
    zoomToNode(nodeId: string) {
      const node = nodesRef.current.find(n => n.id === nodeId)
      if (!node) return
      setCenter(
        node.position.x + NODE_WIDTH / 2,
        node.position.y + NODE_HEIGHT / 2,
        { zoom: 1.2, duration: 800 }
      )
      const data = node.data as unknown as ObjectNodeData
      setSelectedItems([{ nodeId: node.id, data }])
    }
  }), [setCenter])

  const [createForm, setCreateForm] = useState<{ screen: { x: number; y: number }; flow: { x: number; y: number } } | null>(null)
  const [connectForm, setConnectForm] = useState<{
    objectA: { id: string; name: string; class: string }
    objectB: { id: string; name: string; class: string }
    screenPosition: { x: number; y: number }
    editingConnectionId?: string
    isUserCreated?: boolean
    initialRoleA?: string
    initialRoleB?: string
  } | null>(null)

  const rebuildEdges = useCallback(() => {
    const flowEdges: Edge[] = connectionsRef.current.map(conn => {
      const srcPos = nodePositionsRef.current.get(conn.object_a_id) || { x: 0, y: 0 }
      const tgtPos = nodePositionsRef.current.get(conn.object_b_id) || { x: 0, y: 0 }
      const { sourceHandle, targetHandle } = getNearestHandles(srcPos, tgtPos)

      return {
        id: conn.id,
        type: 'role',
        source: conn.object_a_id,
        target: conn.object_b_id,
        sourceHandle,
        targetHandle,
        data: { role_a: conn.role_a, role_b: conn.role_b, highlighted: false },
        style: { stroke: 'var(--color-edge)', strokeWidth: 1.5 },
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
          .filter(c => selectedIds.has(c.object_a_id) && selectedIds.has(c.object_b_id))
          .map(c => c.id)
      )

      if (betweenIds.size > 0) {
        setEdges(current =>
          current.map(e => {
            if (betweenIds.has(e.id)) {
              return {
                ...e,
                data: { ...e.data, highlighted: true },
                style: { stroke: 'var(--color-edge-highlight)', strokeWidth: 2.5 },
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
      .in('class', ['org', 'person'])

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

    // Load canonical connections
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id, object_a_id, object_b_id, role_a, role_b')
      .eq('is_active', true)
      .in('object_a_id', objectIds)
      .in('object_b_id', objectIds)

    // Load user-created connections
    const { data: userConns } = await supabase
      .from('connections_overrides')
      .select('id, object_a_id, object_b_id, role_a, role_b')
      .eq('user_id', user.id)
      .is('connection_id', null)
      .eq('deactivated', false)

    // Filter user connections to only those between visible objects
    const objectIdSet = new Set(objectIds)
    const visibleUserConns = (userConns || []).filter(
      c => c.object_a_id && c.object_b_id && objectIdSet.has(c.object_a_id) && objectIdSet.has(c.object_b_id)
    )

    // Exclude deactivated canonical connections
    const { data: deactivated } = await supabase
      .from('connections_overrides')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('deactivated', true)
      .not('connection_id', 'is', null)

    const deactivatedIds = new Set((deactivated || []).map(d => d.connection_id))
    const visibleCanon = (canonConns || []).filter(c => !deactivatedIds.has(c.id))

    const allConns = [...visibleCanon, ...visibleUserConns]

    // Resolve role UUIDs to display_names for edge labels
    const roleIds = new Set<string>()
    for (const c of allConns) {
      if (c.role_a) roleIds.add(c.role_a)
      if (c.role_b) roleIds.add(c.role_b)
    }

    let roleMap = new Map<string, string>()
    if (roleIds.size > 0) {
      const { data: roles } = await supabase
        .from('roles')
        .select('id, display_name')
        .in('id', Array.from(roleIds))
      for (const r of roles || []) {
        roleMap.set(r.id, r.display_name)
      }
    }

    const userConnIds = new Set(visibleUserConns.map(c => c.id))
    connectionsRef.current = allConns.map(c => ({
      ...c,
      role_a: c.role_a ? roleMap.get(c.role_a) || null : null,
      role_b: c.role_b ? roleMap.get(c.role_b) || null : null,
      isUserCreated: userConnIds.has(c.id),
    }))
    rebuildEdges()
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

  // Double-click detection for edges
  const lastEdgeClickRef = useRef<{ time: number; edgeId: string }>({ time: 0, edgeId: '' })

  // Handle edge selection — show label + turn white when selected
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const now = Date.now()
      const last = lastEdgeClickRef.current

      if (now - last.time < 400 && last.edgeId === edge.id) {
        // Double-click on edge — open edit form
        lastEdgeClickRef.current = { time: 0, edgeId: '' }
        const conn = connectionsRef.current.find(c => c.id === edge.id)
        if (!conn) return

        const nodeA = nodesRef.current.find(n => n.id === conn.object_a_id)
        const nodeB = nodesRef.current.find(n => n.id === conn.object_b_id)
        if (!nodeA || !nodeB) return

        const posA = nodePositionsRef.current.get(conn.object_a_id) || { x: 0, y: 0 }
        const posB = nodePositionsRef.current.get(conn.object_b_id) || { x: 0, y: 0 }
        const midFlow = { x: (posA.x + posB.x) / 2 + NODE_WIDTH / 2, y: (posA.y + posB.y) / 2 + NODE_HEIGHT / 2 }
        const screenPos = flowToScreenPosition(midFlow)

        const dataA = nodeA.data as unknown as ObjectNodeData
        const dataB = nodeB.data as unknown as ObjectNodeData

        setConnectForm({
          objectA: { id: conn.object_a_id, name: dataA.name, class: dataA.class },
          objectB: { id: conn.object_b_id, name: dataB.name, class: dataB.class },
          screenPosition: screenPos,
          editingConnectionId: conn.id,
          isUserCreated: conn.isUserCreated,
          initialRoleA: conn.role_a || '',
          initialRoleB: conn.role_b || '',
        })
        return
      }

      lastEdgeClickRef.current = { time: now, edgeId: edge.id }
      setSelectedItems([])
      setEdges(current =>
        current.map(e => {
          if (e.id === edge.id) {
            return {
              ...e,
              data: { ...e.data, highlighted: true },
              style: { stroke: 'var(--color-edge-highlight)', strokeWidth: 2 },
            }
          }
          return {
            ...e,
            data: { ...e.data, highlighted: false },
            style: { stroke: 'var(--color-edge)', strokeWidth: 1.5 },
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
    setConnectForm(null)
    // Selection clearing is handled by useOnSelectionChange — just reset edge styles
    setEdges(current =>
      current.map(e => ({
        ...e,
        data: { ...e.data, highlighted: false },
        style: { stroke: 'var(--color-edge)', strokeWidth: 1.5 },
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

  // Handle drag-to-connect between nodes
  const handleConnect = useCallback((connection: { source: string | null; target: string | null }) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return

    const sourceNode = nodesRef.current.find(n => n.id === connection.source)
    const targetNode = nodesRef.current.find(n => n.id === connection.target)
    if (!sourceNode || !targetNode) return

    const sourceData = sourceNode.data as unknown as ObjectNodeData
    const targetData = targetNode.data as unknown as ObjectNodeData

    // Position the form at the midpoint between the two nodes
    const posA = nodePositionsRef.current.get(connection.source) || { x: 0, y: 0 }
    const posB = nodePositionsRef.current.get(connection.target) || { x: 0, y: 0 }
    const midFlow = { x: (posA.x + posB.x) / 2 + NODE_WIDTH / 2, y: (posA.y + posB.y) / 2 + NODE_HEIGHT / 2 }
    const screenPos = flowToScreenPosition(midFlow)

    setConnectForm({
      objectA: { id: connection.source, name: sourceData.name, class: sourceData.class },
      objectB: { id: connection.target, name: targetData.name, class: targetData.class },
      screenPosition: screenPos,
    })
  }, [flowToScreenPosition])

  const resolveRoleId = useCallback(async (value: string | null): Promise<string | null> => {
    if (!value || !user) return null

    // Look up by display_name first (handles both existing selections and typed text)
    const { data: existing } = await supabase
      .from('roles')
      .select('id')
      .eq('display_name', value)
      .maybeSingle()

    if (existing) return existing.id

    // Create a new custom role (UUID auto-generated)
    const { data: newRole, error } = await supabase
      .from('roles')
      .insert({
        display_name: value,
        is_canon: false,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error || !newRole) return null
    return newRole.id
  }, [user])

  const handleConnectSubmit = useCallback(async (roleA: string | null, roleB: string | null) => {
    if (!user || !connectForm) return

    const resolvedA = await resolveRoleId(roleA)
    const resolvedB = await resolveRoleId(roleB)

    if (connectForm.editingConnectionId) {
      // Editing existing connection
      if (connectForm.isUserCreated) {
        await supabase
          .from('connections_overrides')
          .update({ role_a: resolvedA, role_b: resolvedB })
          .eq('id', connectForm.editingConnectionId)
      } else {
        // Canonical connection — create/update override
        const { data: existing } = await supabase
          .from('connections_overrides')
          .select('id')
          .eq('user_id', user.id)
          .eq('connection_id', connectForm.editingConnectionId)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('connections_overrides')
            .update({ role_a: resolvedA, role_b: resolvedB })
            .eq('id', existing.id)
        } else {
          await supabase
            .from('connections_overrides')
            .insert({
              user_id: user.id,
              connection_id: connectForm.editingConnectionId,
              object_a_id: connectForm.objectA.id,
              object_b_id: connectForm.objectB.id,
              role_a: resolvedA,
              role_b: resolvedB,
            })
        }
      }
    } else {
      // Creating new connection
      await supabase
        .from('connections_overrides')
        .insert({
          user_id: user.id,
          object_a_id: connectForm.objectA.id,
          object_b_id: connectForm.objectB.id,
          role_a: resolvedA,
          role_b: resolvedB,
        })
    }

    const objectAId = connectForm.objectA.id
    const objectBId = connectForm.objectB.id
    setConnectForm(null)
    await refreshData()

    // Re-highlight the connection after refresh
    setEdges(current =>
      current.map(e => {
        const isMatch =
          (e.source === objectAId && e.target === objectBId) ||
          (e.source === objectBId && e.target === objectAId)
        if (isMatch) {
          return { ...e, data: { ...e.data, highlighted: true }, style: { stroke: 'var(--color-edge-highlight)', strokeWidth: 2 } }
        }
        return e
      })
    )
  }, [user, connectForm, refreshData, resolveRoleId, setEdges])

  const handleConnectDelete = useCallback(async () => {
    if (!user || !connectForm?.editingConnectionId) return

    if (connectForm.isUserCreated) {
      // Hard-delete user-created connection
      await supabase
        .from('connections_overrides')
        .delete()
        .eq('id', connectForm.editingConnectionId)
    } else {
      // Deactivate canonical connection
      const { data: existing } = await supabase
        .from('connections_overrides')
        .select('id')
        .eq('user_id', user.id)
        .eq('connection_id', connectForm.editingConnectionId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('connections_overrides')
          .update({ deactivated: true })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('connections_overrides')
          .insert({
            user_id: user.id,
            connection_id: connectForm.editingConnectionId,
            object_a_id: connectForm.objectA.id,
            object_b_id: connectForm.objectB.id,
            deactivated: true,
          })
      }
    }

    setConnectForm(null)
    await refreshData()
  }, [user, connectForm, refreshData])

  const clearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  // Open connection form between the two selected items
  const openPeerConnect = useCallback(() => {
    if (selectedItems.length !== 2) return
    const a = selectedItems[0]
    const b = selectedItems[1]
    const posA = nodePositionsRef.current.get(a.nodeId) || { x: 0, y: 0 }
    const posB = nodePositionsRef.current.get(b.nodeId) || { x: 0, y: 0 }
    const midFlow = { x: (posA.x + posB.x) / 2 + NODE_WIDTH / 2, y: (posA.y + posB.y) / 2 + NODE_HEIGHT / 2 }
    const screenPos = flowToScreenPosition(midFlow)

    setConnectForm({
      objectA: { id: a.nodeId, name: a.data.name, class: a.data.class },
      objectB: { id: b.nodeId, name: b.data.name, class: b.data.class },
      screenPosition: screenPos,
    })
  }, [selectedItems, flowToScreenPosition])

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
        onConnect={handleConnect}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        zoomOnDoubleClick={false}
        connectionLineType={ConnectionLineType.Straight}
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
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-dots)" />
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
            onConnectToPeer={openPeerConnect}
          />
          <DetailPanel
            nodeId={selectedItems[1].nodeId}
            object={selectedItems[1].data}
            onClose={clearSelection}
            onObjectUpdated={refreshData}
            peerObject={selectedItems[0].data}
            preferredSide={dualSides[1]}
            onConnectToPeer={openPeerConnect}
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

      {/* Connection role form (drag handle to handle) */}
      {connectForm && (
        <ConnectionRoleForm
          objectA={connectForm.objectA}
          objectB={connectForm.objectB}
          userId={user!.id}
          screenPosition={connectForm.screenPosition}
          onSubmit={handleConnectSubmit}
          onDelete={connectForm.editingConnectionId ? handleConnectDelete : undefined}
          onCancel={() => setConnectForm(null)}
          initialRoleA={connectForm.initialRoleA}
          initialRoleB={connectForm.initialRoleB}
        />
      )}
    </div>
  )
})

const Canvas = forwardRef<CanvasRef>(function Canvas(_, ref) {
  return (
    <ReactFlowProvider>
      <CanvasInner ref={ref} />
    </ReactFlowProvider>
  )
})

export default Canvas
