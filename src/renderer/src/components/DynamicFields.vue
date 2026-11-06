<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { CustomFieldEntity, CustomFieldDef } from '@shared/types'
import { Sliders } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    entity: CustomFieldEntity
    modelValue?: Record<string, any>
    title?: string
    columns?: 1 | 2 | 3
  }>(),
  {
    modelValue: () => ({}),
    title: '',
    columns: 2
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void
}>()

const appStore = useAppStore()

const activeFields = computed<CustomFieldDef[]>(() => appStore.getActiveCustomFields(props.entity))

function getFieldValue(key: string): any {
  return props.modelValue ? props.modelValue[key] : ''
}

function updateFieldValue(key: string, value: any): void {
  const updated = { ...(props.modelValue || {}), [key]: value }
  emit('update:modelValue', updated)
}

function getSelectOptions(field: CustomFieldDef): string[] {
  const base = Array.isArray(field.options) ? field.options : []
  // Support dynamic lookup linking if option starts with @lookup:
  if (base.length === 1 && base[0].startsWith('@lookup:')) {
    const cat = base[0].slice('@lookup:'.length)
    const lookupVals = appStore.lookups
      .filter((l) => l.category === cat && l.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => l.value)
    if (lookupVals.length > 0) return lookupVals
  }
  const curVal = getFieldValue(field.key)
  if (curVal && typeof curVal === 'string' && !base.includes(curVal)) {
    return [curVal, ...base]
  }
  return base
}

const gridColsClass = computed(() => {
  if (props.columns === 1) return 'grid-cols-1'
  if (props.columns === 3) return 'grid-cols-1 md:grid-cols-3'
  return 'grid-cols-1 md:grid-cols-2'
})
</script>

<template>
  <div
    v-if="activeFields.length > 0"
    class="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/60 space-y-3 text-xs"
  >
    <div v-if="title" class="flex items-center gap-1.5 font-black text-purple-800 dark:text-purple-300">
      <Sliders class="w-3.5 h-3.5 text-purple-600" />
      <span>{{ title }}</span>
    </div>

    <div :class="['grid gap-3', gridColsClass]">
      <div
        v-for="field in activeFields"
        :key="field.id"
        :class="[field.type === 'textarea' ? 'md:col-span-full' : '']"
      >
        <label class="block font-bold mb-1 text-slate-800 dark:text-slate-200">
          {{ field.label }}
          <span v-if="field.required" class="text-rose-600 font-black">*</span>
        </label>

        <!-- Select Field -->
        <select
          v-if="field.type === 'select'"
          :value="getFieldValue(field.key) ?? ''"
          @change="(e) => updateFieldValue(field.key, (e.target as HTMLSelectElement).value)"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
        >
          <option value="">-- اختر {{ field.label }} --</option>
          <option v-for="opt in getSelectOptions(field)" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>

        <!-- Boolean Checkbox / Toggle -->
        <label
          v-else-if="field.type === 'boolean'"
          class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 cursor-pointer"
        >
          <input
            type="checkbox"
            :checked="Boolean(getFieldValue(field.key))"
            @change="(e) => updateFieldValue(field.key, (e.target as HTMLInputElement).checked)"
            class="w-4 h-4 accent-purple-600 cursor-pointer"
          />
          <span class="font-bold text-slate-700 dark:text-slate-300">
            {{ getFieldValue(field.key) ? 'نعم' : 'لا' }}
          </span>
        </label>

        <!-- Textarea -->
        <textarea
          v-else-if="field.type === 'textarea'"
          :value="getFieldValue(field.key) ?? ''"
          @input="(e) => updateFieldValue(field.key, (e.target as HTMLTextAreaElement).value)"
          rows="2"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
        ></textarea>

        <!-- Number Input -->
        <input
          v-else-if="field.type === 'number'"
          type="number"
          step="any"
          :value="getFieldValue(field.key) ?? ''"
          @input="(e) => updateFieldValue(field.key, (e.target as HTMLInputElement).value)"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
        />

        <!-- Date Input -->
        <input
          v-else-if="field.type === 'date'"
          type="date"
          :value="getFieldValue(field.key) ?? ''"
          @input="(e) => updateFieldValue(field.key, (e.target as HTMLInputElement).value)"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
        />

        <!-- Default Text Input -->
        <input
          v-else
          type="text"
          :value="getFieldValue(field.key) ?? ''"
          @input="(e) => updateFieldValue(field.key, (e.target as HTMLInputElement).value)"
          class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
        />
      </div>
    </div>
  </div>
</template>
