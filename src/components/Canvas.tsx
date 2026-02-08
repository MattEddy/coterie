import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react'
import type { Node, Edge, NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ObjectNode from './ObjectNode'
import type { ObjectNodeData } from './ObjectNode'
import DetailPanel from './DetailPanel'
import styles from './Canvas.module.css'

const nodeTypes = { object: ObjectNode }

const connectionTypeColors: Record<string, string> = {
  employed_by: '#10b981',
  has_deal_at: '#f59e0b',
  produces: '#3b82f6',
  represents: '#a855f7',
  represented_by: '#a855f7',
  attached_to: '#ec4899',
  owns: '#6b7280',
  division_of: '#6b7280',
  reports_to: '#6b7280',
  set_up_at: '#3b82f6',
  related_to: '#6b7280',
}

export default function Canvas() {
  const { user } = useAuth()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedObject, setSelectedObject] = useState<ObjectNodeData | null>(null)

  // Load objects and connections from Supabase
  useEffect(() => {
    if (!user) return

    async function loadData() {
      // Fetch objects with their types and user overrides
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

      // Build nodes from merged data
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

      setNodes(flowNodes)

      // Fetch connections
      const objectIds = objects.map(o => o.id)
      const { data: connections } = await supabase
        .from('connections')
        .select('id, source_id, target_id, type')
        .eq('is_active', true)
        .in('source_id', objectIds)
        .in('target_id', objectIds)

      if (connections) {
        const flowEdges: Edge[] = connections.map(conn => ({
          id: conn.id,
          source: conn.source_id,
          target: conn.target_id,
          label: conn.type.replace(/_/g, ' '),
          style: { stroke: connectionTypeColors[conn.type] || '#666', strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: '#888' },
          labelBgStyle: { fill: 'var(--color-bg)', fillOpacity: 0.8 },
        }))
        setEdges(flowEdges)
      }
    }

    loadData()
  }, [user, setNodes, setEdges])

  // Save position on drag end
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)

      // Persist position changes to Supabase
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          supabase
            .from('objects_overrides')
            .update({ map_x: change.position.x, map_y: change.position.y })
            .eq('object_id', change.id)
            .eq('user_id', user!.id)
            .then()
        }
      }
    },
    [onNodesChange, user]
  )

  // Handle node selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedObject(node.data as unknown as ObjectNodeData)
    },
    []
  )

  const handlePaneClick = useCallback(() => {
    setSelectedObject(null)
  }, [])

  return (
    <div className={styles.container}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#222" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {selectedObject && (
        <DetailPanel object={selectedObject} onClose={() => setSelectedObject(null)} />
      )}
    </div>
  )
}
