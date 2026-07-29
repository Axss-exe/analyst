"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { AppShell } from "@/components/app-shell"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Search, ZoomIn, ZoomOut, Maximize, Filter } from "lucide-react"
import Link from "next/link"

interface GraphNode {
  id: string
  label: string
  type: string
  x: number
  y: number
}

interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
  confidence: number
}

const typeColors: Record<string, string> = {
  person: "#3b82f6", organization: "#a855f7", company: "#10b981", government: "#f59e0b",
  project: "#f43f5e", location: "#06b6d4", mineral: "#64748b", legislation: "#f97316",
  bank: "#6366f1", investor: "#ec4899", mine: "#78716c", infrastructure: "#14b8a6",
}

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        const w = 800, h = 600
        const positioned = d.nodes.map((n: any, i: number) => ({
          ...n,
          x: w / 2 + Math.cos((i / d.nodes.length) * Math.PI * 2) * Math.min(w, h) * 0.35,
          y: h / 2 + Math.sin((i / d.nodes.length) * Math.PI * 2) * Math.min(w, h) * 0.35,
        }))
        setNodes(positioned)
        setEdges(d.edges || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filteredNodes = nodes.filter((n) => {
    if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false
    if (filter && n.type !== filter) return false
    return true
  })

  const filteredIds = new Set(filteredNodes.map((n) => n.id))
  const filteredEdges = edges.filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target))

  const handleZoom = (delta: number) => setScale((s) => Math.max(0.2, Math.min(3, s + delta)))
  const handleReset = () => { setScale(1); setPan({ x: 0, y: 0 }) }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current) { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }) }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  const handleMouseUp = () => setDragging(false)

  const nodeTypes = [...new Set(nodes.map((n) => n.type))]

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relationship Graph</h1>
            <p className="text-sm text-muted-foreground">Explore entity connections</p>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Search nodes..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All Types</option>
              {nodeTypes.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
            <Button variant="outline" size="icon" onClick={() => handleZoom(0.2)}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => handleZoom(-0.2)}><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={handleReset}><Maximize className="h-4 w-4" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : (
          <Card className="relative flex-1 overflow-hidden bg-[#0d1117]">
            <svg
              ref={svgRef}
              className="h-full w-full cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
                {filteredEdges.map((edge) => {
                  const src = filteredNodes.find((n) => n.id === edge.source)
                  const tgt = filteredNodes.find((n) => n.id === edge.target)
                  if (!src || !tgt) return null
                  return (
                    <g key={edge.id}>
                      <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke="#30363d" strokeWidth={1 + edge.confidence} opacity={0.6} />
                      <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2} fill="#8b949e" fontSize="8" textAnchor="middle">{edge.label}</text>
                    </g>
                  )
                })}
                {filteredNodes.map((node) => (
                  <g key={node.id} onClick={() => setSelectedNode(node.id)} className="cursor-pointer">
                    <circle cx={node.x} cy={node.y} r={selectedNode === node.id ? 10 : 6} fill={typeColors[node.type] || "#8b949e"} opacity={selectedNode && selectedNode !== node.id ? 0.3 : 1} stroke={selectedNode === node.id ? "#fff" : "none"} strokeWidth={2} />
                    <text x={node.x} y={node.y + 18} fill="#c9d1d9" fontSize="10" textAnchor="middle">{node.label}</text>
                  </g>
                ))}
              </g>
            </svg>

            {selectedNode && (
              <div className="absolute bottom-4 left-4 rounded-md border border-border bg-card p-4 shadow-lg max-w-xs">
                {(() => {
                  const node = nodes.find((n) => n.id === selectedNode)
                  if (!node) return null
                  return (
                    <div>
                      <p className="font-medium">{node.label}</p>
                      <Badge className="mt-1 capitalize" style={{ backgroundColor: typeColors[node.type] || "#8b949e" }}>{node.type}</Badge>
                      <div className="mt-2 flex gap-2">
                        <Link href={`/entities/${node.id}`}><Button size="sm" variant="outline">View Details</Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedNode(null)}>Close</Button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="absolute top-4 right-4 rounded-md border border-border bg-card/90 p-2 text-xs">
              <p className="font-medium mb-1">{filteredNodes.length} nodes | {filteredEdges.length} edges</p>
              <div className="space-y-0.5">
                {nodeTypes.slice(0, 6).map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: typeColors[t] || "#8b949e" }} />
                    <span className="capitalize">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
