import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ObjectNode from '../components/ObjectNode'
import type { ObjectNodeData } from '../components/ObjectNode'
import RoleEdge from '../components/RoleEdge'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import { useDefaultColorFor } from '../contexts/PillColorsContext'
import logoDark from '../assets/logo-name.svg'
import logoLight from '../assets/logo-name-light.svg'
import styles from './InviteLanding.module.css'

/* ── Demo canvas data ──────────────────────────────────────────── */

const demoNode = (
  id: string, name: string, cls: string, types: string[],
  x: number, y: number, title?: string,
  style?: { color?: string; size?: number },
): Node => ({
  id, type: 'object', position: { x, y },
  data: {
    id, name, title: title ?? null, class: cls,
    status: null, types, photo_url: null,
    data: style ? { color: style.color, size: style.size } : null,
    tags: null,
    is_canon: true, created_by: null,
  } satisfies ObjectNodeData as ObjectNodeData & Record<string, unknown>,
})

const DEMO_NODES: Node[] = [
  demoNode('ted', 'Ted Sarandos', 'person', ['executive'], 60, -160, 'Co-CEO, Netflix', { color: '#7860a0' }),
  demoNode('netflix', 'Netflix', 'org', ['streamer'], 0, 0, undefined, { color: '#8a4d45', size: 3 }),
  demoNode('21laps', '21 Laps Entertainment', 'org', ['production company'], 460, 0, undefined, { color: '#b08a4a', size: 1 }),
  demoNode('shawn', 'Shawn Levy', 'person', ['producer', 'director'], 320, 200, 'Founder, 21 Laps', { size: 1 }),
  demoNode('wme', 'WME', 'org', ['agency'], 720, 180, undefined, { color: '#8e6040', size: 2 }),
]

const EDGE_STYLE = { stroke: 'var(--color-edge)', strokeWidth: 2 }
const EDGE_HIGHLIGHT = { stroke: 'var(--color-edge-highlight)', strokeWidth: 2 }

const demoEdge = (
  id: string, source: string, target: string,
  sH: string, tH: string, roleA?: string, roleB?: string,
): Edge => ({
  id, source, target, sourceHandle: sH, targetHandle: tH,
  type: 'role', style: EDGE_STYLE,
  data: { role_a: roleA ?? null, role_b: roleB ?? null, highlighted: false },
})

const DEMO_EDGES: Edge[] = [
  demoEdge('e1', 'ted', 'netflix', 'bottom', 'top', 'Employee', 'Employer'),
  demoEdge('e3', '21laps', 'netflix', 'left', 'right', 'Producer', 'Overall Deal'),
  demoEdge('e4', '21laps', 'shawn', 'bottom', 'top', 'Company', 'Founder'),
  demoEdge('e5', 'shawn', 'wme', 'right', 'left', 'Client', 'Rep'),
]

const nodeTypes = { object: ObjectNode }
const edgeTypes = { role: RoleEdge }

/* ── Demo detail card ──────────────────────────────────────────── */

type DemoTabId = 'contact' | 'notes' | 'projects' | 'events'

interface DemoDetail {
  id: string
  name: string
  title: string | null
  types: string[]
  cls: string
  color?: string
}


function DemoDetailCard({ detail, onClose }: { detail: DemoDetail; onClose: () => void }) {
  const [tab, setTab] = useState<DemoTabId>('contact')
  const userDefault = useDefaultColorFor(detail.cls)
  const headerColor = detail.color ?? userDefault
  const tabs: { id: DemoTabId; label: string }[] = [
    { id: 'contact', label: 'Contact' },
    { id: 'notes', label: 'Notes' },
    { id: 'projects', label: 'Projects' },
    { id: 'events', label: 'Events' },
  ]

  return (
    <div className={styles.detailCard}>
      <div
        className={styles.detailHeader}
        data-class={detail.cls}
        style={{ background: headerColor, color: '#f5f3f0' }}
      >
        <span className={styles.detailName}>{detail.name}</span>
        {detail.title && <span className={styles.detailTitle}>{detail.title}</span>}
        <span className={styles.detailTypes}>
          {detail.types.map(t => t.replace(/_/g, ' ')).join(' · ')}
        </span>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.detailTabs}>
          {tabs.map(t => (
            <span
              key={t.id}
              className={tab === t.id ? styles.detailTabActive : styles.detailTab}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className={styles.detailContent}>
          {tab === 'contact' && (
            <p className={styles.detailMuted}>
              {detail.cls === 'person'
                ? 'Private contact info is never shared without permission.'
                : 'Store contact information.'}
            </p>
          )}
          {tab === 'notes' && (
            <p className={styles.detailMuted}>
              Add shared notes visible to your shared map, or private notes just for you.
            </p>
          )}
          {tab === 'projects' && (
            <p className={styles.detailMuted}>
              Track projects associated with contacts.
            </p>
          )}
          {tab === 'events' && (
            <p className={styles.detailMuted}>
              Keep a log of contacts' key meetings and events.
            </p>
          )}
        </div>
      </div>
      <button className={styles.detailClose} onClick={onClose}>&times;</button>
    </div>
  )
}

/* ── Invitation data ───────────────────────────────────────────── */

interface InviteData {
  mapName: string
  senderName: string
  mapId: string
  invitationId: string
}

/* ── Demo Canvas (inner component, needs ReactFlowProvider) ──── */

function DemoCanvas() {
  const [nodes, , onNodesChange] = useNodesState(DEMO_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEMO_EDGES)
  const [detail, setDetail] = useState<DemoDetail | null>(null)

  const clearEdgeHighlights = useCallback(() => {
    setEdges(cur => cur.map(e =>
      e.data?.highlighted
        ? { ...e, style: EDGE_STYLE, data: { ...e.data, highlighted: false } }
        : e
    ))
  }, [setEdges])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const d = node.data as unknown as ObjectNodeData
    setDetail({ id: node.id, name: d.name, title: d.title, types: d.types, cls: d.class, color: d.data?.color })
    clearEdgeHighlights()
  }, [clearEdgeHighlights])

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setDetail(null)
    setEdges(cur => cur.map(e => ({
      ...e,
      style: e.id === edge.id ? EDGE_HIGHLIGHT : EDGE_STYLE,
      data: { ...e.data, highlighted: e.id === edge.id },
    })))
  }, [setEdges])

  const handlePaneClick = useCallback(() => {
    setDetail(null)
    clearEdgeHighlights()
  }, [clearEdgeHighlights])

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background color="var(--color-dots)" gap={20} size={1} />
      </ReactFlow>
      {detail && <DemoDetailCard detail={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function InviteLanding() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const logo = resolvedTheme === 'light' ? logoLight : logoDark
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }

    // Dev shortcut: /invite/demo shows sample data
    if (token === 'demo') {
      setInvite({
        mapName: 'Literary Agents',
        senderName: 'Matt',
        mapId: 'demo',
        invitationId: 'demo',
      })
      setLoading(false)
      return
    }

    async function load() {
      const { data, error: rpcErr } = await supabase
        .rpc('get_invitation_by_token', { invite_token: token })
        .single<{ status: string; map_name: string; sender_name: string; map_id: string; invitation_id: string }>()

      if (rpcErr || !data) { setError('This invitation was not found.'); setLoading(false); return }
      if (data.status !== 'pending') { setError('This invitation has already been used.'); setLoading(false); return }

      setInvite({
        mapName: data.map_name || 'a shared map',
        senderName: data.sender_name || 'Someone',
        mapId: data.map_id,
        invitationId: data.invitation_id,
      })
      setLoading(false)
    }
    load()
  }, [token])

  const handleJoin = useCallback(() => {
    navigate(`/invite/${token}/join`)
  }, [token, navigate])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading invitation...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <img src={logo} alt="Coterie" className={styles.logoImg} />
          <p className={styles.errorText}>{error}</p>
          <button className={styles.button} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.page}>
        {/* Header */}
        <p className={styles.invitedBy}>
          <strong>{invite!.senderName}</strong> has invited you to join
        </p>
        <img src={logo} alt="Coterie" className={styles.logoImg} />

        {/* Explainer */}
        <p className={styles.explainer}>
          Visually array people, organizations, and information — so
          you can truly harness the relationships in your world.
        </p>
        <p className={styles.explainer}>
          Share maps with trusted collaborators to sync your
          Coterie information, keeping each other up to date and in the loop.
        </p>

        {/* Demo canvas */}
        <div className={styles.canvasWrapper}>
          <p className={styles.canvasLabel}>Try it out – drag, click, explore:</p>
          <ReactFlowProvider>
            <DemoCanvas />
          </ReactFlowProvider>
        </div>

        {/* Coterie blurb */}
        <p className={styles.blurb}>
          Join {invite!.senderName}'s{' '}
          <em>{invite!.mapName}</em> shared map and start sharing
          professional intel.
        </p>

        {/* CTA */}
        <button className={styles.ctaButton} onClick={handleJoin}>
          Learn More / Join
        </button>
      </div>
    </div>
  )
}
