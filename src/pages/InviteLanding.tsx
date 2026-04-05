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
import { useAuth } from '../contexts/AuthContext'
import logoMottoDark from '../assets/logo-name-motto.svg'
import styles from './InviteLanding.module.css'

/* ── Demo canvas data ──────────────────────────────────────────── */

const demoNode = (
  id: string, name: string, cls: string, types: string[],
  x: number, y: number, title?: string,
): Node => ({
  id, type: 'object', position: { x, y },
  data: {
    id, name, title: title ?? null, class: cls,
    status: null, types, photo_url: null, data: null,
    shared_notes: null, private_notes: null, tags: null,
    is_canon: true, created_by: null,
  } satisfies ObjectNodeData as ObjectNodeData & Record<string, unknown>,
})

const DEMO_NODES: Node[] = [
  demoNode('ted', 'Ted Sarandos', 'person', ['executive'], 60, -160, 'Co-CEO, Netflix'),
  demoNode('netflix', 'Netflix', 'org', ['streamer'], 0, 0),
  demoNode('21laps', '21 Laps Entertainment', 'org', ['production company'], 360, 0),
  demoNode('shawn', 'Shawn Levy', 'person', ['producer', 'director'], 320, 160, 'Founder, 21 Laps'),
  demoNode('wme', 'WME', 'org', ['agency'], 600, 160),
]

const EDGE_STYLE = { stroke: 'var(--color-edge)', strokeWidth: 1.5 }
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
}

const DEMO_PROJECTS: Record<string, { name: string; type: string }[]> = {
  netflix: [
    { name: 'Stranger Things 5', type: 'tv series' },
    { name: 'Glass Onion 2', type: 'feature' },
  ],
  ted: [
    { name: 'Squid Game S3', type: 'tv series' },
  ],
  '21laps': [
    { name: 'Stranger Things 5', type: 'tv series' },
    { name: 'All the Light We Cannot See', type: 'limited series' },
  ],
  shawn: [
    { name: 'Deadpool & Wolverine', type: 'feature' },
    { name: 'Stranger Things 5', type: 'tv series' },
  ],
  wme: [],
}

const DEMO_EVENTS: Record<string, { name: string; date: string }[]> = {
  netflix: [
    { name: 'Q1 Earnings Call', date: '2026-04-15' },
  ],
  ted: [
    { name: 'CinemaCon Keynote', date: '2026-04-01' },
  ],
  '21laps': [],
  shawn: [
    { name: 'DGA Awards', date: '2026-03-08' },
  ],
  wme: [
    { name: 'Upfronts Week', date: '2026-05-12' },
  ],
}

function DemoDetailCard({ detail, onClose }: { detail: DemoDetail; onClose: () => void }) {
  const [tab, setTab] = useState<DemoTabId>('contact')
  const tabs: { id: DemoTabId; label: string }[] = [
    { id: 'contact', label: 'Contact' },
    { id: 'notes', label: 'Notes' },
    { id: 'projects', label: 'Projects' },
    { id: 'events', label: 'Events' },
  ]
  const projects = DEMO_PROJECTS[detail.id] || []
  const events = DEMO_EVENTS[detail.id] || []

  return (
    <div className={styles.detailCard}>
      <div className={styles.detailHeader} data-class={detail.cls}>
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
                : 'No contact information yet.'}
            </p>
          )}
          {tab === 'notes' && (
            <p className={styles.detailMuted}>
              Add shared notes visible to your coterie, or private notes just for you.
            </p>
          )}
          {tab === 'projects' && (
            projects.length > 0 ? (
              <ul className={styles.detailList}>
                {projects.map(p => (
                  <li key={p.name} className={styles.detailListItem}>
                    <span className={styles.detailListName}>{p.name}</span>
                    <span className={styles.detailListType}>{p.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.detailMuted}>No linked projects.</p>
            )
          )}
          {tab === 'events' && (
            events.length > 0 ? (
              <ul className={styles.detailList}>
                {events.map(e => (
                  <li key={e.name} className={styles.detailListItem}>
                    <span className={styles.detailListName}>{e.name}</span>
                    <span className={styles.detailListType}>{e.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.detailMuted}>No linked events.</p>
            )
          )}
        </div>
      </div>
      <button className={styles.detailClose} onClick={onClose}>&times;</button>
    </div>
  )
}

/* ── Invitation data ───────────────────────────────────────────── */

interface InviteData {
  coterieName: string
  senderName: string
  coterieId: string
  invitationId: string
}

/* ── Demo Canvas (inner component, needs ReactFlowProvider) ──── */

function DemoCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEMO_NODES)
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
    setDetail({ id: node.id, name: d.name, title: d.title, types: d.types, cls: d.class })
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
  const { user } = useAuth()
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }

    // Dev shortcut: /invite/demo shows sample data
    if (token === 'demo') {
      setInvite({
        coterieName: 'Literary Agents',
        senderName: 'Matt',
        coterieId: 'demo',
        invitationId: 'demo',
      })
      setLoading(false)
      return
    }

    async function load() {
      // Fetch invitation by token
      const { data: inv, error: invErr } = await supabase
        .from('coterie_invitations')
        .select('id, coterie_id, invited_by, status')
        .eq('token', token)
        .single()

      if (invErr || !inv) { setError('This invitation was not found.'); setLoading(false); return }
      if (inv.status !== 'pending') { setError('This invitation has already been used.'); setLoading(false); return }

      // Fetch coterie name
      const { data: coterie } = await supabase
        .from('coteries')
        .select('name')
        .eq('id', inv.coterie_id)
        .single()

      // Fetch sender name
      const { data: sender } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', inv.invited_by)
        .single()

      setInvite({
        coterieName: coterie?.name || 'a coterie',
        senderName: sender?.display_name || 'Someone',
        coterieId: inv.coterie_id,
        invitationId: inv.id,
      })
      setLoading(false)
    }
    load()
  }, [token])

  const handleJoin = useCallback(() => {
    // Stash token for post-auth pickup
    if (token) sessionStorage.setItem('pendingInviteToken', token)

    if (user) {
      // Already logged in — go straight to landscape (acceptance handled there)
      navigate('/')
    } else {
      navigate(`/login?invite=${token}`)
    }
  }, [token, user, navigate])

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
          <img src={logoMottoDark} alt="Coterie" className={styles.logoImg} />
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
        <img src={logoMottoDark} alt="Coterie — Map your professional world" className={styles.logoImg} />

        {/* Explainer */}
        <p className={styles.explainer}>
          Intuitively and visually array people, organizations, and
          information — so you can truly understand and harness your
          interpersonal landscape.
        </p>
        <p className={styles.explainer}>
          Then link up with trusted collaborators to share and sync your
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
          <em>{invite!.coterieName}</em> coterie and start sharing
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
