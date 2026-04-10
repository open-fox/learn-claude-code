<script setup>
import { ref, computed, onUnmounted } from 'vue'

// ─── Data ───────────────────────────────────────────────────────────
const NODES = [
  { id: 'start',   x: 160, y: 30,  w: 120, h: 40, type: 'rect',    label: 'Start' },
  { id: 'api_call', x: 160, y: 110, w: 120, h: 40, type: 'rect',   label: 'API Call' },
  { id: 'check',   x: 160, y: 200, w: 140, h: 50, type: 'diamond', label: 'stop_reason?' },
  { id: 'execute', x: 160, y: 300, w: 120, h: 40, type: 'rect',    label: 'Execute Tool' },
  { id: 'append',  x: 160, y: 380, w: 120, h: 40, type: 'rect',    label: 'Append Result' },
  { id: 'end',     x: 380, y: 200, w: 120, h: 40, type: 'rect',    label: 'Break / Done' },
]

const EDGES = [
  { from: 'start',   to: 'api_call' },
  { from: 'api_call', to: 'check' },
  { from: 'check',   to: 'execute', label: 'tool_use' },
  { from: 'execute', to: 'append' },
  { from: 'append',  to: 'api_call' },
  { from: 'check',   to: 'end',     label: 'end_turn' },
]

const ACTIVE_NODES = [
  [],
  ['start'],
  ['api_call'],
  ['check', 'execute'],
  ['execute', 'append'],
  ['api_call', 'check', 'execute', 'append'],
  ['check', 'end'],
]

const ACTIVE_EDGES = [
  [],
  [],
  ['start->api_call'],
  ['api_call->check', 'check->execute'],
  ['execute->append'],
  ['append->api_call', 'api_call->check', 'check->execute', 'execute->append'],
  ['api_call->check', 'check->end'],
]

const MESSAGES_PER_STEP = [
  [],
  [{ role: 'user',        detail: 'Fix the login bug',  color: '#3b82f6' }],
  [],
  [{ role: 'assistant',   detail: 'tool_use: read_file', color: '#52525b' }],
  [{ role: 'tool_result', detail: 'auth.ts contents…',  color: '#10b981' }],
  [
    { role: 'assistant',   detail: 'tool_use: edit_file', color: '#52525b' },
    { role: 'tool_result', detail: 'file updated',       color: '#10b981' },
  ],
  [{ role: 'assistant',   detail: 'end_turn: Done!',    color: '#a855f7' }],
]

const STEP_INFO = [
  { title: 'The While Loop',        desc: 'Every agent is a while loop that keeps calling the model until it says "stop".' },
  { title: 'User Input',            desc: 'The loop starts when the user sends a message.' },
  { title: 'Call the Model',        desc: 'Send all messages to the LLM. It sees everything and decides what to do.' },
  { title: 'stop_reason: tool_use', desc: 'The model wants to use a tool. The loop continues.' },
  { title: 'Execute & Append',      desc: 'Run the tool, append the result to messages[]. Feed it back.' },
  { title: 'Loop Again',            desc: 'Same code path, second iteration. The model decides to edit a file.' },
  { title: 'stop_reason: end_turn', desc: 'The model is done. Loop exits. That\'s the entire agent.' },
]

const TOTAL = 7

// ─── State ──────────────────────────────────────────────────────────
const step = ref(0)
let timer = null

const activeNodes = computed(() => ACTIVE_NODES[step.value])
const activeEdges = computed(() => ACTIVE_EDGES[step.value])

const visibleMessages = computed(() => {
  const msgs = []
  for (let s = 0; s <= step.value; s++) {
    for (const m of MESSAGES_PER_STEP[s]) {
      if (m) msgs.push(m)
    }
  }
  return msgs
})

const info = computed(() => STEP_INFO[step.value])

function next() { if (step.value < TOTAL - 1) step.value++ }
function prev() { if (step.value > 0) step.value-- }
function reset() { step.value = 0; stopAuto() }

const isPlaying = ref(false)
function toggleAuto() {
  if (isPlaying.value) { stopAuto() } else { startAuto() }
}
function startAuto() {
  isPlaying.value = true
  timer = setInterval(() => {
    if (step.value < TOTAL - 1) step.value++
    else stopAuto()
  }, 2500)
}
function stopAuto() {
  isPlaying.value = false
  if (timer) { clearInterval(timer); timer = null }
}
onUnmounted(stopAuto)

// ─── SVG Helpers ────────────────────────────────────────────────────
function nodeById(id) { return NODES.find(n => n.id === id) }

function edgePath(from, to) {
  const f = nodeById(from)
  const t = nodeById(to)
  if (from === 'append' && to === 'api_call') {
    const sx = f.x - f.w / 2, sy = f.y
    const ex = t.x - t.w / 2, ey = t.y
    return `M ${sx} ${sy} L ${sx - 50} ${sy} L ${ex - 50} ${ey} L ${ex} ${ey}`
  }
  if (from === 'check' && to === 'end') {
    const sx = f.x + f.w / 2, sy = f.y
    const ex = t.x - t.w / 2, ey = t.y
    return `M ${sx} ${sy} L ${ex} ${ey}`
  }
  return `M ${f.x} ${f.y + f.h / 2} L ${t.x} ${t.y - t.h / 2}`
}

function edgeLabelPos(from, to) {
  const f = nodeById(from)
  const t = nodeById(to)
  if (from === 'check' && to === 'end') {
    return { x: (f.x + t.x) / 2, y: f.y - 10 }
  }
  return { x: f.x + 75, y: (f.y + t.y) / 2 }
}

function diamondPoints(n) {
  const hw = n.w / 2, hh = n.h / 2
  return `${n.x},${n.y - hh} ${n.x + hw},${n.y} ${n.x},${n.y + hh} ${n.x - hw},${n.y}`
}

function isNodeActive(id) { return activeNodes.value.includes(id) }
function isEdgeActive(from, to) { return activeEdges.value.includes(`${from}->${to}`) }
</script>

<template>
  <div class="alv-root">
    <!-- Main panel -->
    <div class="alv-panel">
      <div class="alv-cols">
        <!-- Left: flowchart -->
        <div class="alv-flow">
          <div class="alv-loop-label">while (stop_reason === "tool_use")</div>
          <svg viewBox="0 0 500 440" class="alv-svg">
            <defs>
              <filter id="alv-glow-blue">
                <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#3b82f6" flood-opacity="0.7" />
              </filter>
              <filter id="alv-glow-purple">
                <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#a855f7" flood-opacity="0.7" />
              </filter>
              <marker id="alv-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#71717a" />
              </marker>
              <marker id="alv-arrow-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
              </marker>
            </defs>

            <!-- Edges -->
            <g v-for="e in EDGES" :key="`${e.from}->${e.to}`">
              <path
                :d="edgePath(e.from, e.to)"
                fill="none"
                :stroke="isEdgeActive(e.from, e.to) ? '#3b82f6' : '#52525b'"
                :stroke-width="isEdgeActive(e.from, e.to) ? 2.5 : 1.5"
                :marker-end="isEdgeActive(e.from, e.to) ? 'url(#alv-arrow-active)' : 'url(#alv-arrow)'"
                class="alv-edge"
              />
              <text
                v-if="e.label"
                :x="edgeLabelPos(e.from, e.to).x"
                :y="edgeLabelPos(e.from, e.to).y"
                text-anchor="middle"
                class="alv-edge-label"
              >{{ e.label }}</text>
            </g>

            <!-- Nodes -->
            <g v-for="n in NODES" :key="n.id">
              <!-- Diamond -->
              <template v-if="n.type === 'diamond'">
                <polygon
                  :points="diamondPoints(n)"
                  :fill="isNodeActive(n.id) ? '#1d4ed8' : '#27272a'"
                  :stroke="isNodeActive(n.id) ? '#3b82f6' : '#3f3f46'"
                  stroke-width="1.5"
                  :filter="isNodeActive(n.id) ? 'url(#alv-glow-blue)' : 'none'"
                  class="alv-node"
                />
                <text :x="n.x" :y="n.y + 4" text-anchor="middle" class="alv-node-text"
                  :fill="isNodeActive(n.id) ? '#ffffff' : '#d4d4d8'"
                  font-size="11">{{ n.label }}</text>
              </template>
              <!-- Rect -->
              <template v-else>
                <rect
                  :x="n.x - n.w / 2" :y="n.y - n.h / 2" :width="n.w" :height="n.h" rx="8"
                  :fill="isNodeActive(n.id) ? (n.id === 'end' ? '#7e22ce' : '#1d4ed8') : '#27272a'"
                  :stroke="isNodeActive(n.id) ? (n.id === 'end' ? '#a855f7' : '#3b82f6') : '#3f3f46'"
                  stroke-width="1.5"
                  :filter="isNodeActive(n.id) ? (n.id === 'end' ? 'url(#alv-glow-purple)' : 'url(#alv-glow-blue)') : 'none'"
                  class="alv-node"
                />
                <text :x="n.x" :y="n.y + 4" text-anchor="middle" class="alv-node-text"
                  :fill="isNodeActive(n.id) ? '#ffffff' : '#d4d4d8'"
                  font-size="12">{{ n.label }}</text>
              </template>
            </g>

            <!-- Iteration label -->
            <text v-if="step >= 5" x="60" y="130" text-anchor="middle"
              font-size="10" font-family="monospace" fill="#3b82f6" class="alv-fade-in">iter #2</text>
          </svg>
        </div>

        <!-- Right: messages panel -->
        <div class="alv-msgs">
          <div class="alv-msgs-label">messages[]</div>
          <div class="alv-msgs-box">
            <div v-if="visibleMessages.length === 0" class="alv-empty">[ empty ]</div>
            <TransitionGroup name="msg" tag="div" class="alv-msg-list">
              <div
                v-for="(m, i) in visibleMessages"
                :key="`${m.role}-${m.detail}-${i}`"
                class="alv-msg"
                :style="{ background: m.color }"
              >
                <div class="alv-msg-role">{{ m.role }}</div>
                <div class="alv-msg-detail">{{ m.detail }}</div>
              </div>
            </TransitionGroup>
            <div v-if="visibleMessages.length > 0" class="alv-msg-count">
              length: {{ visibleMessages.length }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step info -->
    <div class="alv-info">
      <div class="alv-info-title">{{ info.title }}</div>
      <div class="alv-info-desc">{{ info.desc }}</div>
    </div>

    <!-- Controls -->
    <div class="alv-controls">
      <div class="alv-btns">
        <button @click="reset" title="Reset" class="alv-btn">⟲</button>
        <button @click="prev" :disabled="step === 0" class="alv-btn">◂</button>
        <button @click="toggleAuto" class="alv-btn">{{ isPlaying ? '⏸' : '▸' }}</button>
        <button @click="next" :disabled="step === TOTAL - 1" class="alv-btn">▸▸</button>
      </div>
      <div class="alv-dots">
        <span v-for="i in TOTAL" :key="i"
          class="alv-dot" :class="{ active: i - 1 === step }" />
        <span class="alv-step-num">{{ step + 1 }}/{{ TOTAL }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alv-root {
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alv-panel {
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #fff;
  padding: 14px;
}

.alv-cols {
  display: flex;
  gap: 14px;
}

.alv-flow {
  flex: 0 0 58%;
}

.alv-loop-label {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: #a1a1aa;
  margin-bottom: 6px;
}

.alv-svg {
  width: 100%;
  border: 1px solid #f4f4f5;
  border-radius: 8px;
  background: #fafafa;
}

.alv-edge {
  transition: stroke 0.4s, stroke-width 0.4s;
}

.alv-edge-label {
  fill: #a1a1aa;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.alv-node {
  transition: fill 0.4s, stroke 0.4s, filter 0.4s;
}

.alv-node-text {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-weight: 600;
  transition: fill 0.4s;
  pointer-events: none;
}

.alv-fade-in {
  animation: alvFadeIn 0.5s ease-out;
}
@keyframes alvFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Messages panel */
.alv-msgs {
  flex: 1;
  min-width: 0;
}

.alv-msgs-label {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: #a1a1aa;
  margin-bottom: 6px;
}

.alv-msgs-box {
  min-height: 260px;
  border: 1px solid #f4f4f5;
  border-radius: 8px;
  background: #fafafa;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alv-empty {
  text-align: center;
  padding: 50px 0;
  font-size: 12px;
  color: #a1a1aa;
}

.alv-msg-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.alv-msg {
  border-radius: 6px;
  padding: 7px 10px;
  color: #fff;
}

.alv-msg-role {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  font-weight: 600;
}

.alv-msg-detail {
  font-size: 10px;
  opacity: 0.85;
  margin-top: 1px;
}

.alv-msg-count {
  margin-top: 6px;
  border-top: 1px solid #e4e4e7;
  padding-top: 6px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  color: #a1a1aa;
}

/* Transition for messages */
.msg-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.msg-leave-active {
  transition: all 0.2s ease;
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.92);
}
.msg-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

/* Info bar */
.alv-info {
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  padding: 10px 14px;
}

.alv-info-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e3a5f;
  margin-bottom: 2px;
}

.alv-info-desc {
  font-size: 12px;
  color: #3b82f6;
}

/* Controls */
.alv-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.alv-btns {
  display: flex;
  gap: 2px;
}

.alv-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 14px;
  color: #71717a;
  cursor: pointer;
  transition: background 0.15s;
}
.alv-btn:hover {
  background: #f4f4f5;
  color: #18181b;
}
.alv-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.alv-btn:disabled:hover {
  background: transparent;
}

.alv-dots {
  display: flex;
  align-items: center;
  gap: 5px;
}

.alv-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e4e4e7;
  transition: background 0.3s;
}
.alv-dot.active {
  background: #3b82f6;
}

.alv-step-num {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: #a1a1aa;
  margin-left: 4px;
}
</style>
