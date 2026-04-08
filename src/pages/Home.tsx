import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
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
import { useTheme } from '../contexts/ThemeContext'
import logoNameDark from '../assets/logo-name.svg'
import logoNameLight from '../assets/logo-name-light.svg'
import logoIcon from '../assets/logo-icon.svg'
import thumbLandscape from '../assets/thumb-landscape.svg'
import thumbDetails from '../assets/thumb-details.svg'
import thumbMaps from '../assets/thumb-maps.svg'
import thumbCoteries from '../assets/thumb-coteries.svg'
import styles from './Home.module.css'

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

function DemoDetailCard({ detail, onClose }: { detail: DemoDetail; onClose: () => void }) {
  const [tab, setTab] = useState<DemoTabId>('contact')
  const tabs: { id: DemoTabId; label: string }[] = [
    { id: 'contact', label: 'Contact' },
    { id: 'notes', label: 'Notes' },
    { id: 'projects', label: 'Projects' },
    { id: 'events', label: 'Events' },
  ]

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

/* ── Feature cards ─────────────────────────────────────────────── */

const features = [
  {
    thumb: thumbLandscape,
    title: 'Landscape',
    description:
      'Visually array the people, organizations, and interrelationships in your world on a single, intuitive canvas.',
  },
  {
    thumb: thumbDetails,
    title: 'Details',
    description:
      'Add contact info and notes, track projects, and log your events — all linked to the people and organizations that matter.',
  },
  {
    thumb: thumbMaps,
    title: 'Maps',
    description:
      'Organize your Landscape into focused subsections — by project, by sector, by whatever makes sense to you.',
  },
  {
    thumb: thumbCoteries,
    title: 'Coteries',
    description:
      'Connect with trusted collaborators to share selected contact intel and keep each other in the loop — in real time.',
  },
]

/* ── Demo Canvas ───────────────────────────────────────────────── */

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

/* ── Home page ─────────────────────────────────────────────────── */

export default function Home() {
  const { resolvedTheme } = useTheme()
  const logo = resolvedTheme === 'light' ? logoNameLight : logoNameDark
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const waitlistRef = useRef<HTMLInputElement>(null)

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = waitlistEmail.trim().toLowerCase()
    if (!email) return
    setWaitlistStatus('sending')
    const { error } = await supabase.from('waitlist').insert({ email })
    if (error) {
      // Duplicate = already on the list, treat as success
      if (error.code === '23505') {
        setWaitlistStatus('done')
      } else {
        console.error('Waitlist error:', error)
        setWaitlistStatus('error')
      }
    } else {
      setWaitlistStatus('done')
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <img src={logo} alt="Coterie" className={styles.headerLogo} />
        <nav className={styles.headerNav}>
          <a href="#overview" className={styles.navLink}>Overview</a>
          <a href="#features" className={styles.navLink}>Features</a>
          <a href="#pricing" className={styles.navLink}>Plans</a>
        </nav>
      </header>

      <div className={styles.page}>
        {/* Overview */}
        <section id="overview" className={styles.overview}>
          <img src={logoIcon} alt="" className={styles.heroIcon} />
          <h1 className={styles.headline}>Map your professional world.</h1>
          <p className={styles.explainer}>
            Visually array people, organizations, and information — so
            you can truly understand and harness your interpersonal landscape.
          </p>
          <p className={styles.explainer}>
            Connect with trusted collaborators to share and sync your
            Coterie information, keeping each other up to date and in the loop.
          </p>
        </section>

        {/* Demo canvas */}
        <div className={styles.canvasWrapper}>
          <p className={styles.canvasLabel}>Try it out – drag, click, explore:</p>
          <ReactFlowProvider>
            <DemoCanvas />
          </ReactFlowProvider>
        </div>

        {/* Features */}
        <section id="features" className={styles.featuresSection}>
          <div className={styles.features}>
            {features.map(f => (
              <div key={f.title} className={styles.featureCard}>
                <img src={f.thumb} alt={f.title} className={styles.featureThumb} />
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Waitlist CTA */}
        <section id="pricing" className={styles.ctaSection}>
          <h2 className={styles.ctaHeadline}>Coterie is invite-only — for now.</h2>
          <p className={styles.ctaSubtext}>
            We're rolling out access gradually. Join the waitlist
            and we'll let you know when it's your turn.
          </p>
          {waitlistStatus === 'done' ? (
            <p className={styles.ctaSuccess}>You're on the list. We'll be in touch.</p>
          ) : (
            <form onSubmit={handleWaitlist} className={styles.waitlistForm}>
              <input
                ref={waitlistRef}
                className={styles.waitlistInput}
                type="email"
                placeholder="you@email.com"
                value={waitlistEmail}
                onChange={e => setWaitlistEmail(e.target.value)}
                required
              />
              <button className={styles.ctaButton} type="submit" disabled={waitlistStatus === 'sending'}>
                {waitlistStatus === 'sending' ? 'Joining...' : 'Join the Waitlist'}
              </button>
            </form>
          )}
          {waitlistStatus === 'error' && (
            <p className={styles.ctaError}>Something went wrong. Please try again.</p>
          )}
        </section>
      </div>
    </div>
  )
}
