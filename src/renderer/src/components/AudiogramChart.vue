<script setup lang="ts">
import { ref, computed } from 'vue'
import type {
  AudiogramPoint,
  AudiogramEar,
  AudiogramConduction,
  AudiogramFrequency
} from '@shared/types'

const props = withDefaults(
  defineProps<{
    modelValue: AudiogramPoint[]
    comparisonPoints?: AudiogramPoint[]
    comparisonLabel?: string
    readonly?: boolean
    filterEar?: 'both' | 'right' | 'left'
    compact?: boolean
  }>(),
  {
    modelValue: () => [],
    comparisonPoints: () => [],
    comparisonLabel: 'فحص سابق للمقارنة',
    readonly: false,
    filterEar: 'both',
    compact: false
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: AudiogramPoint[]): void
}>()

const FREQUENCIES: AudiogramFrequency[] = [250, 500, 1000, 2000, 4000, 8000]
const DB_TICKS = [-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

// Interactive active pen state
const activeEar = ref<AudiogramEar>(props.filterEar === 'left' ? 'left' : 'right')
const activeConduction = ref<AudiogramConduction>('air')
const activeMasked = ref<boolean>(false)
const activeNoResponse = ref<boolean>(false)
const eraseMode = ref<boolean>(false)

// SVG coordinate geometry
const SVG_WIDTH = 560
const SVG_HEIGHT = 430
const PAD_LEFT = 54
const PAD_RIGHT = 28
const PAD_TOP = 38
const PAD_BOTTOM = 36

const PLOT_W = SVG_WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_H = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM

function freqToX(freq: number): number {
  const idx = FREQUENCIES.indexOf(freq as AudiogramFrequency)
  if (idx === -1) return PAD_LEFT
  return PAD_LEFT + (idx / (FREQUENCIES.length - 1)) * PLOT_W
}

function dbToY(db: number): number {
  const clamped = Math.max(-10, Math.min(120, db))
  return PAD_TOP + ((clamped - -10) / 130) * PLOT_H
}

function xToNearestFreq(x: number): AudiogramFrequency {
  let bestFreq: AudiogramFrequency = 1000
  let bestDist = Infinity
  for (const f of FREQUENCIES) {
    const dist = Math.abs(freqToX(f) - x)
    if (dist < bestDist) {
      bestDist = dist
      bestFreq = f
    }
  }
  return bestFreq
}

function yToNearestDb(y: number): number {
  const ratio = (y - PAD_TOP) / PLOT_H
  const rawDb = -10 + ratio * 130
  const snapped5 = Math.round(rawDb / 5) * 5
  return Math.max(-10, Math.min(120, snapped5))
}

function handleSvgClick(event: MouseEvent): void {
  if (props.readonly) return
  const svgEl = event.currentTarget as SVGSVGElement
  if (!svgEl) return
  const rect = svgEl.getBoundingClientRect()
  const scaleX = SVG_WIDTH / rect.width
  const scaleY = SVG_HEIGHT / rect.height
  const clickX = (event.clientX - rect.left) * scaleX
  const clickY = (event.clientY - rect.top) * scaleY

  if (
    clickX < PAD_LEFT - 18 ||
    clickX > SVG_WIDTH - PAD_RIGHT + 18 ||
    clickY < PAD_TOP - 15 ||
    clickY > SVG_HEIGHT - PAD_BOTTOM + 15
  ) {
    return
  }

  const targetEar: AudiogramEar =
    props.filterEar === 'right'
      ? 'right'
      : props.filterEar === 'left'
        ? 'left'
        : activeEar.value
  const freq = xToNearestFreq(clickX)
  const db = yToNearestDb(clickY)

  const next = [...props.modelValue]
  const existingIdx = next.findIndex(
    (p) =>
      p.ear === targetEar &&
      p.conduction === activeConduction.value &&
      Number(p.frequency) === freq
  )

  if (eraseMode.value) {
    if (existingIdx !== -1) {
      next.splice(existingIdx, 1)
      emit('update:modelValue', next)
    }
    return
  }

  const newPt: AudiogramPoint = {
    ear: targetEar,
    conduction: activeConduction.value,
    frequency: freq,
    db_value: db,
    is_masked: activeMasked.value ? 1 : 0,
    no_response: activeNoResponse.value ? 1 : 0
  }

  if (existingIdx !== -1) {
    next[existingIdx] = newPt
  } else {
    next.push(newPt)
  }

  emit('update:modelValue', next)
}

function clearAllPoints(): void {
  if (props.readonly) return
  if (props.filterEar === 'both') {
    emit('update:modelValue', [])
  } else {
    emit(
      'update:modelValue',
      props.modelValue.filter((p) => p.ear !== props.filterEar)
    )
  }
}

function getFilteredPoints(
  source: AudiogramPoint[],
  ear: AudiogramEar,
  conduction: AudiogramConduction
): AudiogramPoint[] {
  if (props.filterEar !== 'both' && props.filterEar !== ear) return []
  return source
    .filter((p) => p.ear === ear && p.conduction === conduction)
    .sort((a, b) => Number(a.frequency) - Number(b.frequency))
}

function buildPolylinePoints(pts: AudiogramPoint[]): string {
  return pts
    .filter((p) => !p.no_response)
    .map((p) => `${freqToX(p.frequency)},${dbToY(p.db_value)}`)
    .join(' ')
}

const rightAir = computed(() => getFilteredPoints(props.modelValue, 'right', 'air'))
const rightBone = computed(() => getFilteredPoints(props.modelValue, 'right', 'bone'))
const leftAir = computed(() => getFilteredPoints(props.modelValue, 'left', 'air'))
const leftBone = computed(() => getFilteredPoints(props.modelValue, 'left', 'bone'))

const compRightAir = computed(() =>
  getFilteredPoints(props.comparisonPoints || [], 'right', 'air')
)
const compLeftAir = computed(() =>
  getFilteredPoints(props.comparisonPoints || [], 'left', 'air')
)

const severityBands = [
  { from: -10, to: 25, label: 'طبيعي', fill: 'rgba(16, 185, 129, 0.05)' },
  { from: 25, to: 40, label: 'خفيف', fill: 'rgba(234, 179, 8, 0.06)' },
  { from: 40, to: 55, label: 'متوسط', fill: 'rgba(249, 115, 22, 0.06)' },
  { from: 55, to: 70, label: 'متوسط الشدة', fill: 'rgba(239, 68, 68, 0.06)' },
  { from: 70, to: 90, label: 'شديد', fill: 'rgba(190, 18, 60, 0.07)' },
  { from: 90, to: 120, label: 'عميق', fill: 'rgba(88, 28, 135, 0.08)' }
]
</script>

<template>
  <div class="space-y-2.5 select-none">
    <!-- Interactive Toolbar (Hidden in Readonly / Print mode) -->
    <div
      v-if="!readonly"
      class="no-print flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <!-- Ear Selector -->
        <template v-if="filterEar === 'both'">
          <button
            type="button"
            @click="
              activeEar = 'right';
              eraseMode = false
            "
            :class="[
              'px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition cursor-pointer',
              activeEar === 'right' && !eraseMode
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-red-600 border border-red-200 dark:border-red-900/60'
            ]"
          >
            <span class="font-mono text-sm">O</span>
            أذن يمين (Right)
          </button>

          <button
            type="button"
            @click="
              activeEar = 'left';
              eraseMode = false
            "
            :class="[
              'px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition cursor-pointer',
              activeEar === 'left' && !eraseMode
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-blue-600 border border-blue-200 dark:border-blue-900/60'
            ]"
          >
            <span class="font-mono text-sm">X</span>
            أذن يسار (Left)
          </button>
        </template>

        <!-- Conduction Selector -->
        <div class="flex rounded-lg bg-white dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            @click="
              activeConduction = 'air';
              eraseMode = false
            "
            :class="[
              'px-2.5 py-1 rounded-md font-bold transition cursor-pointer',
              activeConduction === 'air' && !eraseMode
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300'
            ]"
          >
            توصيل هوائي (Air)
          </button>
          <button
            type="button"
            @click="
              activeConduction = 'bone';
              eraseMode = false
            "
            :class="[
              'px-2.5 py-1 rounded-md font-bold transition cursor-pointer',
              activeConduction === 'bone' && !eraseMode
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300'
            ]"
          >
            توصيل عظمي (Bone)
          </button>
        </div>

        <!-- Masked & No Response toggles -->
        <label
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
        >
          <input v-model="activeMasked" type="checkbox" class="rounded accent-indigo-600" />
          <span>مع تغطية (Masked)</span>
        </label>

        <label
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
          title="عدم وجود استجابة عند أقصى شدة (No Response)"
        >
          <input v-model="activeNoResponse" type="checkbox" class="rounded accent-rose-600" />
          <span>NR (لا استجابة)</span>
        </label>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          @click="eraseMode = !eraseMode"
          :class="[
            'px-2.5 py-1 rounded-lg font-bold transition cursor-pointer border',
            eraseMode
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
          ]"
        >
          {{ eraseMode ? 'وضع الحذف مفعّل (انقر على نقطة)' : 'حذف نقطة' }}
        </button>
        <button
          type="button"
          @click="clearAllPoints"
          class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold cursor-pointer"
        >
          مسح الكل
        </button>
      </div>
    </div>

    <!-- Audiogram SVG Canvas -->
    <div
      class="relative bg-white text-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden shadow-xs"
    >
      <svg
        :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
        :class="['w-full h-auto block', !readonly ? 'cursor-crosshair' : '']"
        @click="handleSvgClick"
      >
        <!-- Severity Background Bands -->
        <g v-for="(band, bIdx) in severityBands" :key="bIdx">
          <rect
            :x="PAD_LEFT"
            :y="dbToY(band.from)"
            :width="PLOT_W"
            :height="dbToY(band.to) - dbToY(band.from)"
            :fill="band.fill"
          />
          <text
            :x="SVG_WIDTH - PAD_RIGHT - 4"
            :y="(dbToY(band.from) + dbToY(band.to)) / 2 + 3"
            text-anchor="Start"
            font-size="8.5"
            fill="#64748b"
            opacity="0.75"
          >
            {{ band.label }}
          </text>
        </g>

        <!-- Horizontal dB Grid Lines -->
        <g v-for="db in DB_TICKS" :key="`db-${db}`">
          <line
            :x1="PAD_LEFT"
            :y1="dbToY(db)"
            :x2="SVG_WIDTH - PAD_RIGHT"
            :y2="dbToY(db)"
            :stroke="db === 25 ? '#94a3b8' : '#cbd5e1'"
            :stroke-width="db === 0 || db === 25 ? 1.4 : 0.8"
            :stroke-dasharray="db === 25 ? '4,3' : undefined"
          />
          <text
            :x="PAD_LEFT - 10"
            :y="dbToY(db) + 4"
            text-anchor="end"
            font-size="11"
            font-family="monospace"
            font-weight="bold"
            fill="#334155"
          >
            {{ db }}
          </text>
        </g>

        <!-- Vertical Frequency Grid Lines -->
        <g v-for="freq in FREQUENCIES" :key="`freq-${freq}`">
          <line
            :x1="freqToX(freq)"
            :y1="PAD_TOP"
            :x2="freqToX(freq)"
            :y2="SVG_HEIGHT - PAD_BOTTOM"
            stroke="#cbd5e1"
            stroke-width="0.9"
          />
          <text
            :x="freqToX(freq)"
            :y="PAD_TOP - 12"
            text-anchor="middle"
            font-size="11"
            font-family="monospace"
            font-weight="bold"
            fill="#1e293b"
          >
            {{ freq }}
          </text>
          <text
            :x="freqToX(freq)"
            :y="SVG_HEIGHT - 12"
            text-anchor="middle"
            font-size="10"
            font-family="monospace"
            fill="#64748b"
          >
            {{ freq }} Hz
          </text>
        </g>

        <!-- Axis Titles -->
        <text
          :x="14"
          :y="PAD_TOP + PLOT_H / 2"
          text-anchor="middle"
          font-size="10"
          font-weight="bold"
          fill="#475569"
          :transform="`rotate(-90, 14, ${PAD_TOP + PLOT_H / 2})`"
        >
          شدة الصوت (dB HL)
        </text>

        <!-- ======================================================= -->
        <!-- COMPARISON OVERLAY CURVES (IF PROVIDED)                 -->
        <!-- ======================================================= -->
        <polyline
          v-if="compRightAir.length > 1"
          :points="buildPolylinePoints(compRightAir)"
          fill="none"
          stroke="#f87171"
          stroke-width="2"
          stroke-dasharray="3,4"
          opacity="0.55"
        />
        <g v-for="pt in compRightAir" :key="`comp-ra-${pt.frequency}`" opacity="0.55">
          <circle
            :cx="freqToX(pt.frequency)"
            :cy="dbToY(pt.db_value)"
            r="4.5"
            fill="none"
            stroke="#dc2626"
            stroke-width="1.6"
          />
        </g>

        <polyline
          v-if="compLeftAir.length > 1"
          :points="buildPolylinePoints(compLeftAir)"
          fill="none"
          stroke="#60a5fa"
          stroke-width="2"
          stroke-dasharray="3,4"
          opacity="0.55"
        />
        <g v-for="pt in compLeftAir" :key="`comp-la-${pt.frequency}`" opacity="0.55">
          <line
            :x1="freqToX(pt.frequency) - 4"
            :y1="dbToY(pt.db_value) - 4"
            :x2="freqToX(pt.frequency) + 4"
            :y2="dbToY(pt.db_value) + 4"
            stroke="#2563eb"
            stroke-width="1.6"
          />
          <line
            :x1="freqToX(pt.frequency) + 4"
            :y1="dbToY(pt.db_value) - 4"
            :x2="freqToX(pt.frequency) - 4"
            :y2="dbToY(pt.db_value) + 4"
            stroke="#2563eb"
            stroke-width="1.6"
          />
        </g>

        <!-- ======================================================= -->
        <!-- RIGHT EAR (RED #dc2626) LINES & SYMBOLS                 -->
        <!-- ======================================================= -->
        <!-- Right Air Line (Solid Red) -->
        <polyline
          v-if="rightAir.length > 1"
          :points="buildPolylinePoints(rightAir)"
          fill="none"
          stroke="#dc2626"
          stroke-width="2.4"
        />
        <!-- Right Bone Line (Dashed Red) -->
        <polyline
          v-if="rightBone.length > 1"
          :points="buildPolylinePoints(rightBone)"
          fill="none"
          stroke="#dc2626"
          stroke-width="2"
          stroke-dasharray="6,4"
        />

        <!-- Right Air Points: O (unmasked) or Triangle △ (masked) -->
        <g v-for="pt in rightAir" :key="`ra-${pt.frequency}`">
          <!-- Triangle △ if masked -->
          <polygon
            v-if="pt.is_masked"
            :points="`${freqToX(pt.frequency)},${dbToY(pt.db_value) - 7} ${freqToX(pt.frequency) - 6.5},${dbToY(pt.db_value) + 5.5} ${freqToX(pt.frequency) + 6.5},${dbToY(pt.db_value) + 5.5}`"
            fill="white"
            stroke="#dc2626"
            stroke-width="2.2"
          />
          <!-- Circle O if unmasked -->
          <circle
            v-else
            :cx="freqToX(pt.frequency)"
            :cy="dbToY(pt.db_value)"
            r="6"
            fill="white"
            stroke="#dc2626"
            stroke-width="2.3"
          />
          <!-- No response arrow -->
          <path
            v-if="pt.no_response"
            :d="`M ${freqToX(pt.frequency) - 4} ${dbToY(pt.db_value) + 5} L ${freqToX(pt.frequency) - 10} ${dbToY(pt.db_value) + 12} M ${freqToX(pt.frequency) - 10} ${dbToY(pt.db_value) + 12} L ${freqToX(pt.frequency) - 6} ${dbToY(pt.db_value) + 12} M ${freqToX(pt.frequency) - 10} ${dbToY(pt.db_value) + 12} L ${freqToX(pt.frequency) - 10} ${dbToY(pt.db_value) + 8}`"
            stroke="#dc2626"
            stroke-width="1.8"
            fill="none"
          />
        </g>

        <!-- Right Bone Points: < (unmasked) or [ (masked) -->
        <g v-for="pt in rightBone" :key="`rb-${pt.frequency}`">
          <path
            v-if="pt.is_masked"
            :d="`M ${freqToX(pt.frequency) - 2} ${dbToY(pt.db_value) - 7} L ${freqToX(pt.frequency) - 8} ${dbToY(pt.db_value) - 7} L ${freqToX(pt.frequency) - 8} ${dbToY(pt.db_value) + 7} L ${freqToX(pt.frequency) - 2} ${dbToY(pt.db_value) + 7}`"
            fill="none"
            stroke="#dc2626"
            stroke-width="2.3"
          />
          <path
            v-else
            :d="`M ${freqToX(pt.frequency) - 2} ${dbToY(pt.db_value) - 7} L ${freqToX(pt.frequency) - 9} ${dbToY(pt.db_value)} L ${freqToX(pt.frequency) - 2} ${dbToY(pt.db_value) + 7}`"
            fill="none"
            stroke="#dc2626"
            stroke-width="2.3"
          />
        </g>

        <!-- ======================================================= -->
        <!-- LEFT EAR (BLUE #2563eb) LINES & SYMBOLS                 -->
        <!-- ======================================================= -->
        <!-- Left Air Line (Solid Blue) -->
        <polyline
          v-if="leftAir.length > 1"
          :points="buildPolylinePoints(leftAir)"
          fill="none"
          stroke="#2563eb"
          stroke-width="2.4"
        />
        <!-- Left Bone Line (Dashed Blue) -->
        <polyline
          v-if="leftBone.length > 1"
          :points="buildPolylinePoints(leftBone)"
          fill="none"
          stroke="#2563eb"
          stroke-width="2"
          stroke-dasharray="6,4"
        />

        <!-- Left Air Points: X (unmasked) or Square □ (masked) -->
        <g v-for="pt in leftAir" :key="`la-${pt.frequency}`">
          <!-- Square □ if masked -->
          <rect
            v-if="pt.is_masked"
            :x="freqToX(pt.frequency) - 5.5"
            :y="dbToY(pt.db_value) - 5.5"
            width="11"
            height="11"
            fill="white"
            stroke="#2563eb"
            stroke-width="2.2"
          />
          <!-- Cross X if unmasked -->
          <g v-else>
            <line
              :x1="freqToX(pt.frequency) - 6"
              :y1="dbToY(pt.db_value) - 6"
              :x2="freqToX(pt.frequency) + 6"
              :y2="dbToY(pt.db_value) + 6"
              stroke="#2563eb"
              stroke-width="2.4"
            />
            <line
              :x1="freqToX(pt.frequency) + 6"
              :y1="dbToY(pt.db_value) - 6"
              :x2="freqToX(pt.frequency) - 6"
              :y2="dbToY(pt.db_value) + 6"
              stroke="#2563eb"
              stroke-width="2.4"
            />
          </g>
          <!-- No response arrow -->
          <path
            v-if="pt.no_response"
            :d="`M ${freqToX(pt.frequency) + 4} ${dbToY(pt.db_value) + 5} L ${freqToX(pt.frequency) + 10} ${dbToY(pt.db_value) + 12} M ${freqToX(pt.frequency) + 10} ${dbToY(pt.db_value) + 12} L ${freqToX(pt.frequency) + 6} ${dbToY(pt.db_value) + 12} M ${freqToX(pt.frequency) + 10} ${dbToY(pt.db_value) + 12} L ${freqToX(pt.frequency) + 10} ${dbToY(pt.db_value) + 8}`"
            stroke="#2563eb"
            stroke-width="1.8"
            fill="none"
          />
        </g>

        <!-- Left Bone Points: > (unmasked) or ] (masked) -->
        <g v-for="pt in leftBone" :key="`lb-${pt.frequency}`">
          <path
            v-if="pt.is_masked"
            :d="`M ${freqToX(pt.frequency) + 2} ${dbToY(pt.db_value) - 7} L ${freqToX(pt.frequency) + 8} ${dbToY(pt.db_value) - 7} L ${freqToX(pt.frequency) + 8} ${dbToY(pt.db_value) + 7} L ${freqToX(pt.frequency) + 2} ${dbToY(pt.db_value) + 7}`"
            fill="none"
            stroke="#2563eb"
            stroke-width="2.3"
          />
          <path
            v-else
            :d="`M ${freqToX(pt.frequency) + 2} ${dbToY(pt.db_value) - 7} L ${freqToX(pt.frequency) + 9} ${dbToY(pt.db_value)} L ${freqToX(pt.frequency) + 2} ${dbToY(pt.db_value) + 7}`"
            fill="none"
            stroke="#2563eb"
            stroke-width="2.3"
          />
        </g>
      </svg>
    </div>

    <!-- Legend Bar -->
    <div
      v-if="!compact"
      class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span class="font-bold text-red-600 flex items-center gap-1">
          <strong class="font-mono">O</strong> يمين هوائي |
          <strong class="font-mono">△</strong> يمين Masked |
          <strong class="font-mono">&lt; / [</strong> يمين عظمي
        </span>
        <span class="font-bold text-blue-600 flex items-center gap-1">
          <strong class="font-mono">X</strong> يسار هوائي |
          <strong class="font-mono">□</strong> يسار Masked |
          <strong class="font-mono">&gt; / ]</strong> يسار عظمي
        </span>
      </div>
      <div v-if="comparisonPoints && comparisonPoints.length > 0" class="font-bold text-amber-600">
        --- الخط المنقط الباهت: {{ comparisonLabel }}
      </div>
    </div>
  </div>
</template>
