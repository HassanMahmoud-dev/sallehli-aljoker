<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type {
  HearingTest,
  AudiogramPoint,
  AudiogramFrequency,
  AudiogramEar,
  AudiogramConduction,
  Technician,
  Product
} from '@shared/types'
import AudiogramChart from './AudiogramChart.vue'
import { Sparkles, CheckCircle2, ShoppingCart, SplitSquareVertical } from 'lucide-vue-next'

const props = defineProps<{
  initialTest?: Partial<HearingTest> | null
  patientId: number
  patientName: string
  technicians: Technician[]
  products: Product[]
}>()

const emit = defineEmits<{
  (e: 'submit', payload: Partial<HearingTest> & { points: AudiogramPoint[] }): void
  (e: 'cancel'): void
  (
    e: 'convert-to-sale',
    payload: { patientId: number; productId: number | null; notes: string }
  ): void
}>()

const FREQUENCIES: AudiogramFrequency[] = [250, 500, 1000, 2000, 4000, 8000]
const TYMP_TYPES = ['', 'Type A (طبيعي)', 'Type As (تيبّس)', 'Type Ad (فرط حركة)', 'Type B (ارتشاح/ثقب)', 'Type C (ضغط سلبي)']
const LOSS_TYPES = [
  '',
  'سمع طبيعي (Normal)',
  'ضعف سمعي توصيلي (Conductive)',
  'ضعف سمعي حسي عصبي (Sensorineural)',
  'ضعف سمعي مختلط (Mixed)'
]
const LOSS_DEGREES = [
  '',
  'طبيعي (≤25 dB)',
  'ضعف خفيف (Mild 26-40 dB)',
  'ضعف متوسط (Moderate 41-55 dB)',
  'متوسط الشدة (Mod-Severe 56-70 dB)',
  'ضعف شديد (Severe 71-90 dB)',
  'ضعف عميق (Profound >90 dB)'
]

const splitEarsView = ref(false)

const form = ref<Partial<HearingTest>>({
  id: props.initialTest?.id,
  test_number: props.initialTest?.test_number || '',
  patient_id: props.patientId,
  test_date: props.initialTest?.test_date || new Date().toISOString().slice(0, 10),
  examiner_id: props.initialTest?.examiner_id || null,
  examiner_name: props.initialTest?.examiner_name || '',
  test_type: props.initialTest?.test_type || 'comprehensive',
  srt_right: props.initialTest?.srt_right ?? null,
  srt_left: props.initialTest?.srt_left ?? null,
  sds_right: props.initialTest?.sds_right ?? null,
  sds_left: props.initialTest?.sds_left ?? null,
  mcl_right: props.initialTest?.mcl_right ?? null,
  mcl_left: props.initialTest?.mcl_left ?? null,
  ucl_right: props.initialTest?.ucl_right ?? null,
  ucl_left: props.initialTest?.ucl_left ?? null,
  tymp_right: props.initialTest?.tymp_right || '',
  tymp_left: props.initialTest?.tymp_left || '',
  pta_right: props.initialTest?.pta_right ?? null,
  pta_left: props.initialTest?.pta_left ?? null,
  loss_type_right: props.initialTest?.loss_type_right || '',
  loss_type_left: props.initialTest?.loss_type_left || '',
  loss_degree_right: props.initialTest?.loss_degree_right || '',
  loss_degree_left: props.initialTest?.loss_degree_left || '',
  recommended_product_id: props.initialTest?.recommended_product_id || null,
  recommended_product_name: props.initialTest?.recommended_product_name || '',
  recommendation_notes: props.initialTest?.recommendation_notes || '',
  notes: props.initialTest?.notes || ''
})

const points = ref<AudiogramPoint[]>(
  Array.isArray(props.initialTest?.points)
    ? props.initialTest!.points.map((p) => ({ ...p }))
    : []
)

const recommendableProducts = computed(() =>
  props.products.filter(
    (p) => p.is_active && (p.type === 'hearing_aid' || p.type === 'cochlear_processor')
  )
)

// Helper to get/set point from the numeric table
function getPointDb(
  ear: AudiogramEar,
  conduction: AudiogramConduction,
  freq: AudiogramFrequency
): string {
  const found = points.value.find(
    (p) => p.ear === ear && p.conduction === conduction && Number(p.frequency) === freq
  )
  return found !== undefined ? String(found.db_value) : ''
}

function isPointMasked(
  ear: AudiogramEar,
  conduction: AudiogramConduction,
  freq: AudiogramFrequency
): boolean {
  const found = points.value.find(
    (p) => p.ear === ear && p.conduction === conduction && Number(p.frequency) === freq
  )
  return Boolean(found?.is_masked)
}

function setPointDb(
  ear: AudiogramEar,
  conduction: AudiogramConduction,
  freq: AudiogramFrequency,
  rawVal: string
): void {
  const trimmed = rawVal.trim()
  const next = [...points.value]
  const idx = next.findIndex(
    (p) => p.ear === ear && p.conduction === conduction && Number(p.frequency) === freq
  )

  if (trimmed === '' || Number.isNaN(Number(trimmed))) {
    if (idx !== -1) {
      next.splice(idx, 1)
      points.value = next
    }
    return
  }

  const db = Math.max(-10, Math.min(120, Number(trimmed)))
  if (idx !== -1) {
    next[idx] = { ...next[idx], db_value: db }
  } else {
    next.push({
      ear,
      conduction,
      frequency: freq,
      db_value: db,
      is_masked: 0,
      no_response: 0
    })
  }
  points.value = next
}

function togglePointMask(
  ear: AudiogramEar,
  conduction: AudiogramConduction,
  freq: AudiogramFrequency
): void {
  const next = [...points.value]
  const idx = next.findIndex(
    (p) => p.ear === ear && p.conduction === conduction && Number(p.frequency) === freq
  )
  if (idx !== -1) {
    next[idx] = { ...next[idx], is_masked: next[idx].is_masked ? 0 : 1 }
    points.value = next
  }
}

// Automatic PTA & Loss Classification Suggestion
const autoSuggestion = computed(() => {
  const ptaFreqs = new Set([500, 1000, 2000, 4000])
  const calcEar = (ear: AudiogramEar) => {
    const air = points.value.filter(
      (p) => p.ear === ear && p.conduction === 'air' && ptaFreqs.has(Number(p.frequency))
    )
    const bone = points.value.filter(
      (p) => p.ear === ear && p.conduction === 'bone' && ptaFreqs.has(Number(p.frequency))
    )
    if (air.length === 0) return { pta: null, degree: '', type: '' }

    const pta =
      Math.round((air.reduce((s, p) => s + Number(p.db_value), 0) / air.length) * 10) / 10

    let degree = 'طبيعي (≤25 dB)'
    if (pta <= 25) degree = 'طبيعي (≤25 dB)'
    else if (pta <= 40) degree = 'ضعف خفيف (Mild 26-40 dB)'
    else if (pta <= 55) degree = 'ضعف متوسط (Moderate 41-55 dB)'
    else if (pta <= 70) degree = 'متوسط الشدة (Mod-Severe 56-70 dB)'
    else if (pta <= 90) degree = 'ضعف شديد (Severe 71-90 dB)'
    else degree = 'ضعف عميق (Profound >90 dB)'

    let type = 'سمع طبيعي (Normal)'
    if (pta > 25) {
      if (bone.length > 0) {
        const boneAvg = bone.reduce((s, p) => s + Number(p.db_value), 0) / bone.length
        const gap = pta - boneAvg
        if (boneAvg <= 25 && gap >= 15) type = 'ضعف سمعي توصيلي (Conductive)'
        else if (boneAvg > 25 && gap < 15) type = 'ضعف سمعي حسي عصبي (Sensorineural)'
        else type = 'ضعف سمعي مختلط (Mixed)'
      } else {
        type = 'ضعف سمعي حسي عصبي (Sensorineural)'
      }
    }
    return { pta, degree, type }
  }

  return {
    right: calcEar('right'),
    left: calcEar('left')
  }
})

// Auto-update PTA when points change, and fill empty loss degree/type
watch(
  autoSuggestion,
  (val) => {
    if (val.right.pta !== null) {
      form.value.pta_right = val.right.pta
      if (!form.value.loss_degree_right) form.value.loss_degree_right = val.right.degree
      if (!form.value.loss_type_right) form.value.loss_type_right = val.right.type
    }
    if (val.left.pta !== null) {
      form.value.pta_left = val.left.pta
      if (!form.value.loss_degree_left) form.value.loss_degree_left = val.left.degree
      if (!form.value.loss_type_left) form.value.loss_type_left = val.left.type
    }
  },
  { deep: true }
)

function applyAutoSuggestions(): void {
  if (autoSuggestion.value.right.pta !== null) {
    form.value.pta_right = autoSuggestion.value.right.pta
    form.value.loss_degree_right = autoSuggestion.value.right.degree
    form.value.loss_type_right = autoSuggestion.value.right.type
  }
  if (autoSuggestion.value.left.pta !== null) {
    form.value.pta_left = autoSuggestion.value.left.pta
    form.value.loss_degree_left = autoSuggestion.value.left.degree
    form.value.loss_type_left = autoSuggestion.value.left.type
  }
}

function handleSubmit(): void {
  emit('submit', {
    ...form.value,
    patient_id: props.patientId,
    points: points.value
  })
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-5 text-xs">
    <!-- Top Meta Row -->
    <div
      class="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800"
    >
      <div>
        <label class="block font-bold mb-1">المريض</label>
        <input
          :value="patientName"
          disabled
          type="text"
          class="w-full px-3 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
        />
      </div>
      <div>
        <label class="block font-bold mb-1">تاريخ الفحص *</label>
        <input
          v-model="form.test_date"
          required
          type="date"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
        />
      </div>
      <div>
        <label class="block font-bold mb-1">نوع الفحص السمعي</label>
        <select
          v-model="form.test_type"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option value="comprehensive">فحص سمعي شامل (Pure Tone + Speech + Tymp)</option>
          <option value="pure_tone">مخطط نغمات نقية (Pure Tone Audiometry)</option>
          <option value="speech">قياس تمييز الكلام (Speech Audiometry)</option>
          <option value="tympanometry">ضغط الأذن الوسطى (Tympanometry)</option>
          <option value="aided">فحص بالسماعة (Aided Free-Field)</option>
          <option value="free_field">مجال حر (Free Field)</option>
        </select>
      </div>
      <div>
        <label class="block font-bold mb-1">أخصائي السمعيات الفاحص</label>
        <select
          v-model="form.examiner_id"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option :value="null">— اختر الأخصائي أو اكتب اسمه —</option>
          <option v-for="tech in technicians" :key="tech.id" :value="tech.id">
            {{ tech.name }} ({{ tech.specialty }})
          </option>
        </select>
      </div>
    </div>

    <!-- Interactive SVG Audiogram Section -->
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="font-black text-sm text-slate-900 dark:text-white">
          🎧 مخطط السمع التفاعلي (Audiogram) — انقر على الشبكة أو أدخل القيم في الجدول أدناه
        </h4>
        <button
          type="button"
          @click="splitEarsView = !splitEarsView"
          class="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <SplitSquareVertical class="w-4 h-4" />
          {{ splitEarsView ? 'دمج الأذنين في مخطط واحد' : 'فصل الأذن اليمنى واليسرى في مخططين' }}
        </button>
      </div>

      <div v-if="!splitEarsView">
        <AudiogramChart v-model="points" filter-ear="both" />
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/20">
          <div class="font-black text-red-600 mb-2 text-center">الأذن اليمنى — Right Ear (O)</div>
          <AudiogramChart v-model="points" filter-ear="right" compact />
        </div>
        <div class="p-3 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/20">
          <div class="font-black text-blue-600 mb-2 text-center">الأذن اليسرى — Left Ear (X)</div>
          <AudiogramChart v-model="points" filter-ear="left" compact />
        </div>
      </div>
    </div>

    <!-- Synchronized Numeric Frequency Table (250 - 8000 Hz) -->
    <div
      class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900"
    >
      <div
        class="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between"
      >
        <span>جدول إدخال الترددات الرقمي (dB HL) — متزامن مباشرة مع الرسم البياني</span>
        <span class="text-[11px] text-slate-500">زر (M) يفعّل التغطية Masking للتردد</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-center text-xs border-collapse">
          <thead class="bg-slate-50 dark:bg-slate-800/60 font-bold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th class="py-2 px-3 text-right">الأذن / التوصيل</th>
              <th v-for="freq in FREQUENCIES" :key="freq" class="py-2 px-2 font-mono">
                {{ freq }} Hz
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
            <!-- Right Air -->
            <tr class="bg-red-50/30 dark:bg-red-950/10">
              <td class="py-2 px-3 text-right font-black text-red-600">
                🔴 يمين — هوائي (Air R)
              </td>
              <td v-for="freq in FREQUENCIES" :key="`ra-${freq}`" class="py-1.5 px-1.5">
                <div class="flex items-center justify-center gap-1">
                  <input
                    :value="getPointDb('right', 'air', freq)"
                    @input="(e) => setPointDb('right', 'air', freq, (e.target as HTMLInputElement).value)"
                    type="number"
                    min="-10"
                    max="120"
                    step="5"
                    placeholder="—"
                    class="w-14 px-1.5 py-1 text-center font-mono font-bold rounded-lg bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/60"
                  />
                  <button
                    type="button"
                    @click="togglePointMask('right', 'air', freq)"
                    :class="[
                      'px-1.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer',
                      isPointMasked('right', 'air', freq)
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    ]"
                    title="تغطية Masking (مثلث △)"
                  >
                    M
                  </button>
                </div>
              </td>
            </tr>
            <!-- Right Bone -->
            <tr class="bg-red-50/10 dark:bg-red-950/5">
              <td class="py-2 px-3 text-right font-bold text-red-700 dark:text-red-400">
                🔴 يمين — عظمي (Bone R)
              </td>
              <td v-for="freq in FREQUENCIES" :key="`rb-${freq}`" class="py-1.5 px-1.5">
                <div class="flex items-center justify-center gap-1">
                  <input
                    :value="getPointDb('right', 'bone', freq)"
                    @input="(e) => setPointDb('right', 'bone', freq, (e.target as HTMLInputElement).value)"
                    type="number"
                    min="-10"
                    max="120"
                    step="5"
                    placeholder="—"
                    class="w-14 px-1.5 py-1 text-center font-mono font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    @click="togglePointMask('right', 'bone', freq)"
                    :class="[
                      'px-1.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer',
                      isPointMasked('right', 'bone', freq)
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    ]"
                    title="تغطية عظمي [ "
                  >
                    M
                  </button>
                </div>
              </td>
            </tr>
            <!-- Left Air -->
            <tr class="bg-blue-50/30 dark:bg-blue-950/10">
              <td class="py-2 px-3 text-right font-black text-blue-600">
                🔵 يسار — هوائي (Air L)
              </td>
              <td v-for="freq in FREQUENCIES" :key="`la-${freq}`" class="py-1.5 px-1.5">
                <div class="flex items-center justify-center gap-1">
                  <input
                    :value="getPointDb('left', 'air', freq)"
                    @input="(e) => setPointDb('left', 'air', freq, (e.target as HTMLInputElement).value)"
                    type="number"
                    min="-10"
                    max="120"
                    step="5"
                    placeholder="—"
                    class="w-14 px-1.5 py-1 text-center font-mono font-bold rounded-lg bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/60"
                  />
                  <button
                    type="button"
                    @click="togglePointMask('left', 'air', freq)"
                    :class="[
                      'px-1.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer',
                      isPointMasked('left', 'air', freq)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    ]"
                    title="تغطية Masking (مربع □)"
                  >
                    M
                  </button>
                </div>
              </td>
            </tr>
            <!-- Left Bone -->
            <tr class="bg-blue-50/10 dark:bg-blue-950/5">
              <td class="py-2 px-3 text-right font-bold text-blue-700 dark:text-blue-400">
                🔵 يسار — عظمي (Bone L)
              </td>
              <td v-for="freq in FREQUENCIES" :key="`lb-${freq}`" class="py-1.5 px-1.5">
                <div class="flex items-center justify-center gap-1">
                  <input
                    :value="getPointDb('left', 'bone', freq)"
                    @input="(e) => setPointDb('left', 'bone', freq, (e.target as HTMLInputElement).value)"
                    type="number"
                    min="-10"
                    max="120"
                    step="5"
                    placeholder="—"
                    class="w-14 px-1.5 py-1 text-center font-mono font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    @click="togglePointMask('left', 'bone', freq)"
                    :class="[
                      'px-1.5 py-1 rounded text-[10px] font-mono font-bold cursor-pointer',
                      isPointMasked('left', 'bone', freq)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    ]"
                    title="تغطية عظمي ] "
                  >
                    M
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Speech Audiometry (SRT / SDS / MCL / UCL) & Tympanometry -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Right Ear Clinical Metrics -->
      <div
        class="p-4 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/10 space-y-3"
      >
        <div class="flex items-center justify-between">
          <h5 class="font-black text-red-600 text-sm">🔴 نتائج الأذن اليمنى (Right Ear)</h5>
          <span
            v-if="autoSuggestion.right.pta !== null"
            class="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200 font-mono font-black"
          >
            PTA: {{ autoSuggestion.right.pta }} dB
          </span>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-bold mb-1">SRT (dB)</label>
            <input
              v-model.number="form.srt_right"
              type="number"
              step="5"
              placeholder="مثال: 45"
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">SDS تمييز (%)</label>
            <input
              v-model.number="form.sds_right"
              type="number"
              min="0"
              max="100"
              placeholder="مثال: 88%"
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">تقييم الطبلة (Tymp)</label>
            <select
              v-model="form.tymp_right"
              class="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option v-for="t in TYMP_TYPES" :key="t" :value="t">{{ t || '— اختر —' }}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold mb-1">نوع الفقد (يمين)</label>
            <input
              v-model="form.loss_type_right"
              list="loss-types-list"
              placeholder="توصيلي / حسي عصبي / مختلط"
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">درجة الفقد (يمين)</label>
            <input
              v-model="form.loss_degree_right"
              list="loss-degrees-list"
              placeholder="خفيف / متوسط / شديد..."
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
        </div>
      </div>

      <!-- Left Ear Clinical Metrics -->
      <div
        class="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/20 dark:bg-blue-950/10 space-y-3"
      >
        <div class="flex items-center justify-between">
          <h5 class="font-black text-blue-600 text-sm">🔵 نتائج الأذن اليسرى (Left Ear)</h5>
          <span
            v-if="autoSuggestion.left.pta !== null"
            class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 font-mono font-black"
          >
            PTA: {{ autoSuggestion.left.pta }} dB
          </span>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-bold mb-1">SRT (dB)</label>
            <input
              v-model.number="form.srt_left"
              type="number"
              step="5"
              placeholder="مثال: 50"
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">SDS تمييز (%)</label>
            <input
              v-model.number="form.sds_left"
              type="number"
              min="0"
              max="100"
              placeholder="مثال: 84%"
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">تقييم الطبلة (Tymp)</label>
            <select
              v-model="form.tymp_left"
              class="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option v-for="t in TYMP_TYPES" :key="t" :value="t">{{ t || '— اختر —' }}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold mb-1">نوع الفقد (يسار)</label>
            <input
              v-model="form.loss_type_left"
              list="loss-types-list"
              placeholder="توصيلي / حسي عصبي / مختلط"
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">درجة الفقد (يسار)</label>
            <input
              v-model="form.loss_degree_left"
              list="loss-degrees-list"
              placeholder="خفيف / متوسط / شديد..."
              class="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
        </div>
      </div>
    </div>

    <datalist id="loss-types-list">
      <option v-for="lt in LOSS_TYPES" :key="lt" :value="lt" />
    </datalist>
    <datalist id="loss-degrees-list">
      <option v-for="ld in LOSS_DEGREES" :key="ld" :value="ld" />
    </datalist>

    <!-- Auto PTA Suggestion Banner -->
    <div
      v-if="autoSuggestion.right.pta !== null || autoSuggestion.left.pta !== null"
      class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
    >
      <div class="flex items-center gap-2">
        <Sparkles class="w-4 h-4 text-amber-600" />
        <span>
          <strong>الاقتراح التلقائي بناءً على متوسط PTA:</strong>
          <span v-if="autoSuggestion.right.pta !== null" class="mr-2">
            يمين ({{ autoSuggestion.right.pta }} dB): {{ autoSuggestion.right.degree }} —
            {{ autoSuggestion.right.type }}
          </span>
          <span v-if="autoSuggestion.left.pta !== null" class="mr-2">
            | يسار ({{ autoSuggestion.left.pta }} dB): {{ autoSuggestion.left.degree }} —
            {{ autoSuggestion.left.type }}
          </span>
        </span>
      </div>
      <button
        type="button"
        @click="applyAutoSuggestions"
        class="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
      >
        تطبيق الاقتراح التلقائي
      </button>
    </div>

    <!-- Product Recommendation & Notes (4.5 Link to Sales) -->
    <div
      class="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h5 class="font-black text-indigo-700 dark:text-indigo-300 text-sm">
          💡 التوصية الطبية بالسماعة المناسبة وربطها بالمبيعات
        </h5>
        <button
          v-if="form.recommended_product_id"
          type="button"
          @click="
            emit('convert-to-sale', {
              patientId: props.patientId,
              productId: form.recommended_product_id || null,
              notes: form.recommendation_notes || ''
            })
          "
          class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <ShoppingCart class="w-3.5 h-3.5" />
          فتح فاتورة بيع بالتوصية
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block font-bold mb-1">السماعة / المعالج الموصى به من المخزون</label>
          <select
            v-model="form.recommended_product_id"
            class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
          >
            <option :value="null">— بدون توصية منتج محدد —</option>
            <option v-for="prod in recommendableProducts" :key="prod.id" :value="prod.id">
              {{ prod.name }} — {{ prod.brand }} {{ prod.model }} ({{ prod.sale_price }} ج.م)
            </option>
          </select>
        </div>
        <div>
          <label class="block font-bold mb-1">ملاحظات التوصية والبرمجة المقترحة</label>
          <input
            v-model="form.recommendation_notes"
            type="text"
            placeholder="مثال: يوصى بسماعة BTE Power ثنائية مع قالب سيليكون مرن وتهوية 1.5mm..."
            class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
          />
        </div>
      </div>

      <div>
        <label class="block font-bold mb-1">التقرير الطبي والملاحظات السريرية</label>
        <textarea
          v-model="form.notes"
          rows="2"
          placeholder="أي ملاحظات سريرية إضافية حول حالة طبلة الأذن أو الطنين أو التوصيات..."
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
        ></textarea>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <button
        type="button"
        @click="emit('cancel')"
        class="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
      >
        إلغاء
      </button>
      <button
        type="submit"
        class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black flex items-center gap-1.5 shadow-md cursor-pointer"
      >
        <CheckCircle2 class="w-4 h-4" />
        حفظ فحص السمع والأوديوجرام
      </button>
    </div>
  </form>
</template>
