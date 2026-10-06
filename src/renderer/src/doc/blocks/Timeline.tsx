// Timelines: a vertical story (newest last, grouped by year), or a Gantt chart
// with lanes, phases, milestones, dependencies and today's line.
import clsx from 'clsx'
import { ArrowUpRight, Check, Diamond, OctagonAlert } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dayToDate, endDay, formatRange, MONTHS, startDay, today } from '@core/blocks/dates'
import { DATE_PATTERN, type Color, type TimelineBlock } from '@core/blocks/schema'
import { useDoc, useFollow } from '../context'
import { Markdown, Prose } from '../Markdown'

type Item = TimelineBlock['items'][number]
/** An item with a start: only those have a place on a scale. */
type Dated = Item & { start: string }

const isDated = (item: Item): item is Dated => !!item.start

const STATUS_LABELS: Record<Item['status'], string> = { done: 'Done', current: 'In progress', planned: 'Planned', blocked: 'Blocked' }
const LANE_COLORS: Color[] = ['blue', 'violet', 'teal', 'amber', 'pink', 'green', 'orange']

function laneColors(block: TimelineBlock): Map<string, Color> {
  return new Map(block.lanes.map((lane, i) => [lane.id, lane.color ?? LANE_COLORS[i % LANE_COLORS.length]]))
}

function itemEnd(item: Dated): number {
  return item.kind === 'phase' && item.end ? endDay(item.end) : item.kind === 'phase' ? endDay(item.start) : startDay(item.start)
}

function StatusPill({ status }: { status: Item['status'] }) {
  return (
    <span className="doc-tl-status" data-status={status}>
      {status === 'done' && <Check className="size-3" />}
      {status === 'blocked' && <OctagonAlert className="size-3" />}
      {status === 'current' && <span className="doc-tl-pulse" />}
      {STATUS_LABELS[status]}
    </span>
  )
}

export function TimelineView({ block }: { block: TimelineBlock }) {
  // While a date is being typed, it may not be readable yet: its item waits.
  const items = block.items.filter((item) => (!item.start || DATE_PATTERN.test(item.start)) && (!item.end || DATE_PATTERN.test(item.end)))
  const dated = items.filter(isDated)
  const undated = items.filter((item) => !isDated(item))
  return (
    <figure className="doc-timeline">
      {block.title && <figcaption className="doc-timeline-title">{block.title}</figcaption>}
      {items.length === 0 ? (
        <div className="doc-empty-text">No item yet</div>
      ) : block.view === 'gantt' ? (
        <>
          {dated.length > 0 ? <Gantt block={block} items={dated} /> : <div className="doc-empty-text">No dated item to draw yet</div>}
          {undated.length > 0 && <Undated block={block} items={undated} />}
        </>
      ) : (
        <VerticalTimeline block={block} items={items} />
      )}
    </figure>
  )
}

/** A Gantt chart has no place for the items without a date: they are listed under it. */
function Undated({ block, items }: { block: TimelineBlock; items: Item[] }) {
  const follow = useFollow()
  const colors = laneColors(block)
  return (
    <div className="doc-gantt-undated">
      <span className="doc-gantt-undated-title">Not dated</span>
      {items.map((item) => (
        <span
          key={item.id}
          className={clsx('doc-gantt-undated-item', `is-${item.status}`, item.link && 'is-link')}
          data-color={item.lane ? (colors.get(item.lane) ?? 'gray') : 'red'}
          title={STATUS_LABELS[item.status]}
          onClick={() => item.link && follow(item.link)}
        >
          {item.kind === 'milestone' ? <Diamond className="size-3" /> : <span className="doc-gantt-undated-dot" />}
          {item.title}
        </span>
      ))}
    </div>
  )
}

// --------------------------------------------------------------- vertical

function VerticalTimeline({ block, items: all }: { block: TimelineBlock; items: Item[] }) {
  const follow = useFollow()
  const colors = laneColors(block)
  const lanes = new Map(block.lanes.map((lane) => [lane.id, lane.title]))
  // Sorted by date when every item has one; otherwise in the order they are written.
  const items = all.every(isDated) ? [...all].sort((a, b) => startDay(a.start) - startDay(b.start)) : all
  const years = new Set(items.filter(isDated).map((item) => item.start.slice(0, 4)))
  let year = ''

  return (
    <ol className="doc-tl-vertical">
      {items.flatMap((item) => {
        const nodes: ReactNode[] = []
        const itemYear = item.start?.slice(0, 4)
        if (itemYear && years.size > 1 && itemYear !== year) {
          year = itemYear
          nodes.push(
            <li key={`year-${year}`} className="doc-tl-year">
              <span>{year}</span>
            </li>
          )
        }
        const color = item.lane ? colors.get(item.lane) : undefined
        nodes.push(
          <li key={item.id} className={clsx('doc-tl-entry', `is-${item.status}`, `kind-${item.kind}`)} data-color={color ?? 'red'}>
            <div className="doc-tl-marker">{item.kind === 'milestone' ? <Diamond className="size-3" /> : item.status === 'done' ? <Check className="size-3" /> : null}</div>
            <div className="doc-tl-card">
              <div className="doc-tl-meta">
                {item.start && <time>{formatRange(item.start, item.kind === 'phase' ? item.end : undefined)}</time>}
                {item.lane && lanes.get(item.lane) && (
                  <span className="doc-badge" data-color={color}>
                    {lanes.get(item.lane)}
                  </span>
                )}
                <StatusPill status={item.status} />
              </div>
              <div className="doc-tl-heading">
                {item.link ? (
                  <button type="button" className="doc-tl-link" onClick={() => follow(item.link!)}>
                    {item.title}
                    <ArrowUpRight className="size-3.5" />
                  </button>
                ) : (
                  item.title
                )}
              </div>
              {item.description && <Prose md={item.description} className="doc-tl-text" />}
            </div>
          </li>
        )
        return nodes
      })}
    </ol>
  )
}

// ------------------------------------------------------------------ gantt

const ROW = 38
const LANE_PAD = 10
const HEADER = 50

interface Placed {
  item: Dated
  start: number
  end: number
  row: number
  laneIndex: number
}

interface Tick {
  day: number
  label: string
}

function monthStart(day: number): number {
  const d = dayToDate(day)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 86_400_000
}

function nextMonth(day: number, months = 1): number {
  const d = dayToDate(day)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1) / 86_400_000
}

/** The time range shown and its graduations; it leaves room for the labels of the last points. */
function scale(items: Dated[], width: number): { from: number; to: number; ticks: Tick[]; groups: Tick[] } {
  let from = Math.min(...items.map((i) => startDay(i.start)))
  let to = Math.max(...items.map(itemEnd))
  const daysPerPixel = Math.max(1, to - from) / Math.max(320, width)
  for (const item of items) {
    if (item.kind !== 'phase') to = Math.max(to, startDay(item.start) + (item.title.length * 7 + 30) * daysPerPixel)
  }
  to = Math.ceil(to)
  const span = to - from
  if (span <= 62) {
    // Weeks, starting on Mondays.
    from -= ((dayToDate(from).getUTCDay() + 6) % 7) + 3
    to += 10
    const ticks: Tick[] = []
    const first = from + ((8 - dayToDate(from).getUTCDay()) % 7)
    for (let day = first; day <= to; day += 7) ticks.push({ day, label: `${dayToDate(day).getUTCDate()} ${MONTHS[dayToDate(day).getUTCMonth()]}` })
    const groups: Tick[] = []
    for (let day = monthStart(from); day <= to; day = nextMonth(day)) {
      groups.push({ day: Math.max(day, from), label: `${MONTHS[dayToDate(day).getUTCMonth()]} ${dayToDate(day).getUTCFullYear()}` })
    }
    return { from, to, ticks, groups }
  }
  from = monthStart(from)
  to = nextMonth(to) - 1
  const quarters = to - from > 760
  const ticks: Tick[] = []
  for (let day = quarters ? nextMonth(from, -(dayToDate(from).getUTCMonth() % 3)) : from; day <= to; day = nextMonth(day, quarters ? 3 : 1)) {
    const d = dayToDate(day)
    ticks.push({ day: Math.max(day, from), label: quarters ? `Q${Math.floor(d.getUTCMonth() / 3) + 1}` : MONTHS[d.getUTCMonth()] })
  }
  const groups: Tick[] = []
  for (let y = dayToDate(from).getUTCFullYear(); y <= dayToDate(to).getUTCFullYear(); y++) {
    groups.push({ day: Math.max(Date.UTC(y, 0, 1) / 86_400_000, from), label: String(y) })
  }
  return { from, to, ticks, groups }
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function Gantt({ block, items: dated }: { block: TimelineBlock; items: Dated[] }) {
  const follow = useFollow()
  const { printing } = useDoc()
  const [areaRef, measured] = useWidth()
  const width = measured || 640
  const [hovered, setHovered] = useState<string | null>(null)
  const colors = laneColors(block)
  const { from, to, ticks, groups } = useMemo(() => scale(dated, width), [dated, width])
  const days = to - from + 1
  const x = (day: number): number => ((day - from) / days) * width
  const pct = (day: number): string => `${((day - from) / days) * 100}%`

  // Lanes in their order, then the items without lane; each lane packs its items in rows.
  const lanes = useMemo(() => {
    const list = block.lanes.map((lane) => ({ id: lane.id, title: lane.title }))
    if (dated.some((item) => !item.lane || !block.lanes.some((l) => l.id === item.lane))) list.push({ id: '', title: block.lanes.length ? 'Other' : '' })
    return list
  }, [block.lanes, dated])

  const placed: Placed[] = []
  const laneTops: number[] = []
  let top = 0
  const pointWidth = days * 0.14
  lanes.forEach((lane, laneIndex) => {
    laneTops.push(top)
    const rows: number[] = []
    const items = dated
      .filter((item) => (lane.id ? item.lane === lane.id : !item.lane || !block.lanes.some((l) => l.id === item.lane)))
      .sort((a, b) => startDay(a.start) - startDay(b.start))
    for (const item of items) {
      const start = startDay(item.start)
      const end = itemEnd(item)
      const reach = item.kind === 'phase' ? Math.max(end, start + (item.title.length * 7 * days) / width) : start + pointWidth
      let row = rows.findIndex((last) => last < start)
      if (row < 0) row = rows.push(reach) - 1
      else rows[row] = reach
      placed.push({ item, start, end, row, laneIndex })
    }
    top += Math.max(1, rows.length) * ROW + LANE_PAD * 2
  })
  const height = top
  const yOf = (p: Placed): number => laneTops[p.laneIndex] + LANE_PAD + p.row * ROW + ROW / 2
  const byId = new Map(placed.map((p) => [p.item.id, p]))
  const now = today()
  const showToday = block.today !== false && now >= from && now <= to
  const hasLaneColumn = lanes.some((lane) => lane.title)
  const hoveredItem = hovered ? byId.get(hovered) : undefined

  return (
    <div className={clsx('doc-gantt', !hasLaneColumn && 'no-lanes')}>
      {hasLaneColumn && (
        <div className="doc-gantt-lanes" style={{ paddingTop: HEADER }}>
          {lanes.map((lane, i) => (
            <div
              key={lane.id || '_other'}
              className="doc-gantt-lane-title"
              data-color={lane.id ? colors.get(lane.id) : 'gray'}
              style={{ height: (laneTops[i + 1] ?? height) - laneTops[i] }}
            >
              <span className="doc-gantt-lane-dot" />
              {lane.title}
            </div>
          ))}
        </div>
      )}
      <div className="doc-gantt-scroll">
        <div className="doc-gantt-area" ref={areaRef}>
          <div className="doc-gantt-header" style={{ height: HEADER }}>
            {groups.map((group) => (
              <div key={`g${group.day}`} className="doc-gantt-group" style={{ left: pct(group.day) }}>
                {group.label}
              </div>
            ))}
            {ticks.map((tick) => (
              <div key={`t${tick.day}`} className="doc-gantt-tick" style={{ left: pct(tick.day) }}>
                {tick.label}
              </div>
            ))}
          </div>
          <div className="doc-gantt-body" style={{ height }}>
            {ticks.map((tick) => (
              <div key={`l${tick.day}`} className="doc-gantt-gridline" style={{ left: pct(tick.day) }} />
            ))}
            {lanes.map((lane, i) => (
              <div key={`b${lane.id}`} className="doc-gantt-band" style={{ top: laneTops[i], height: (laneTops[i + 1] ?? height) - laneTops[i] }} />
            ))}
            {showToday && (
              <div className="doc-gantt-today" style={{ left: pct(now + 0.5) }}>
                <span>Today</span>
              </div>
            )}
            <svg className="doc-gantt-links" width={width} height={height} aria-hidden>
              <defs>
                <marker id={`arrow-${block.id}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 z" className="doc-gantt-arrowhead" />
                </marker>
              </defs>
              {placed.flatMap((p) =>
                (p.item.dependsOn ?? []).map((id) => {
                  const source = byId.get(id)
                  if (!source) return null
                  const x1 = source.item.kind === 'phase' ? x(source.end + 1) : x(source.start + 0.5) + 7
                  const y1 = yOf(source)
                  const x2 = p.item.kind === 'phase' ? x(p.start) - 2 : x(p.start + 0.5) - 9
                  const y2 = yOf(p)
                  const bend = Math.max(18, Math.min(60, Math.abs(x2 - x1) / 2))
                  return (
                    <path
                      key={`${id}-${p.item.id}`}
                      d={`M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                      className={clsx('doc-gantt-link', (hovered === id || hovered === p.item.id) && 'is-hot')}
                      markerEnd={`url(#arrow-${block.id})`}
                    />
                  )
                })
              )}
            </svg>
            {placed.map((p) => {
              const color = p.item.lane ? (colors.get(p.item.lane) ?? 'gray') : 'red'
              const y = yOf(p)
              const common = {
                'data-color': color,
                onMouseEnter: () => setHovered(p.item.id),
                onMouseLeave: () => setHovered(null),
                onClick: () => p.item.link && follow(p.item.link)
              }
              if (p.item.kind !== 'phase') {
                const left = x(p.start + 0.5)
                const labelLeft = left + 12 + p.item.title.length * 7 > width
                return (
                  <div
                    key={p.item.id}
                    className={clsx('doc-gantt-point', `kind-${p.item.kind}`, `is-${p.item.status}`, p.item.link && 'is-link')}
                    style={{ left, top: y }}
                    {...common}
                  >
                    <span className="doc-gantt-point-mark" />
                    <span className={clsx('doc-gantt-point-label', labelLeft && 'is-left')}>{p.item.title}</span>
                  </div>
                )
              }
              const left = x(p.start)
              const barWidth = Math.max(6, x(p.end + 1) - left)
              const inside = barWidth > p.item.title.length * 6.8 + 26
              const outsideLeft = !inside && left + barWidth + p.item.title.length * 7 + 12 > width
              return (
                <div
                  key={p.item.id}
                  className={clsx('doc-gantt-bar', `is-${p.item.status}`, p.item.link && 'is-link')}
                  style={{ left, width: barWidth, top: y - 13 }}
                  {...common}
                >
                  {p.item.status === 'done' && inside && <Check className="doc-gantt-bar-icon size-3" />}
                  <span className={clsx('doc-gantt-bar-label', !inside && 'is-outside', outsideLeft && 'is-left')}>{p.item.title}</span>
                </div>
              )
            })}
            {hoveredItem && !printing && (
              <div
                className={clsx('doc-gantt-card', x(hoveredItem.start) > width * 0.6 && 'is-left')}
                style={{ left: x(hoveredItem.start) > width * 0.6 ? x(hoveredItem.end + 1) : x(hoveredItem.start), top: yOf(hoveredItem) + 18 }}
              >
                <div className="doc-gantt-card-title">{hoveredItem.item.title}</div>
                <div className="doc-gantt-card-meta">
                  {formatRange(hoveredItem.item.start, hoveredItem.item.kind === 'phase' ? hoveredItem.item.end : undefined)}
                  <StatusPill status={hoveredItem.item.status} />
                </div>
                {hoveredItem.item.description && (
                  <div className="doc-gantt-card-text">
                    <Markdown>{hoveredItem.item.description}</Markdown>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <GanttLegend items={dated} showToday={showToday} />
      {printing && <GanttNotes items={dated} />}
    </div>
  )
}

function GanttLegend({ items, showToday }: { items: Item[]; showToday: boolean }) {
  const statuses = (Object.keys(STATUS_LABELS) as Item['status'][]).filter((status) => items.some((i) => i.status === status))
  return (
    <div className="doc-gantt-legend">
      {statuses.map((status) => (
        <span key={status} className="doc-gantt-legend-item">
          <span className={clsx('doc-gantt-legend-swatch', `is-${status}`)} />
          {STATUS_LABELS[status]}
        </span>
      ))}
      {items.some((i) => i.kind === 'milestone') && (
        <span className="doc-gantt-legend-item">
          <span className="doc-gantt-legend-diamond" />
          Milestone
        </span>
      )}
      {showToday && (
        <span className="doc-gantt-legend-item">
          <span className="doc-gantt-legend-today" />
          Today
        </span>
      )}
    </div>
  )
}

/** In print, descriptions cannot be hovered: they are listed under the chart. */
function GanttNotes({ items }: { items: Dated[] }) {
  const described = items.filter((item) => item.description)
  if (described.length === 0) return null
  return (
    <dl className="doc-gantt-notes">
      {described.map((item) => (
        <div key={item.id}>
          <dt>
            {item.title} <span>{formatRange(item.start, item.kind === 'phase' ? item.end : undefined)}</span>
          </dt>
          <dd>
            <Markdown>{item.description!}</Markdown>
          </dd>
        </div>
      ))}
    </dl>
  )
}
