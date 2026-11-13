<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown, Search, Check } from 'lucide-vue-next'

export interface SelectOption {
  value: string | number | null
  label: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined
    options: Array<SelectOption | string | number>
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    disabled?: boolean
    searchThreshold?: number
  }>(),
  {
    placeholder: 'اختر...',
    searchPlaceholder: 'بحث...',
    emptyText: 'لا توجد نتائج',
    disabled: false,
    searchThreshold: 5
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number | null): void
  (e: 'change', value: string | number | null): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')

const normalizedOptions = computed<SelectOption[]>(() =>
  props.options.map((opt) =>
    typeof opt === 'object' && opt !== null
      ? opt
      : { value: opt, label: String(opt) }
  )
)

const showSearch = computed(() => normalizedOptions.value.length > props.searchThreshold)

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q || !showSearch.value) return normalizedOptions.value
  return normalizedOptions.value.filter((opt) =>
    opt.label.toLowerCase().includes(q)
  )
})

const selectedOption = computed(() =>
  normalizedOptions.value.find((opt) => opt.value === props.modelValue)
)

function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function closeDropdown() {
  isOpen.value = false
  searchQuery.value = ''
}

function selectOption(opt: SelectOption) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  closeDropdown()
}

function handleClickOutside(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    closeDropdown()
  }
}

watch(isOpen, async (open) => {
  if (open) {
    searchQuery.value = ''
    if (showSearch.value) {
      await nextTick()
      searchInputRef.value?.focus()
    }
  }
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <button
      type="button"
      :disabled="disabled"
      @click="toggleDropdown"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-right transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span class="truncate" :class="selectedOption ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'">
        {{ selectedOption ? selectedOption.label : placeholder }}
      </span>
      <ChevronDown
        class="w-4 h-4 shrink-0 text-slate-400 transition-transform duration-150"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <div
      v-if="isOpen"
      class="absolute z-50 mt-1 w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden"
    >
      <div
        v-if="showSearch"
        class="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
      >
        <div class="relative flex items-center">
          <Search class="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="searchPlaceholder"
            class="w-full pr-8 pl-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
        </div>
      </div>

      <ul class="max-h-60 overflow-y-auto py-1">
        <li v-if="filteredOptions.length === 0" class="px-3 py-2 text-xs text-slate-400 text-center">
          {{ emptyText }}
        </li>
        <li
          v-for="opt in filteredOptions"
          :key="String(opt.value)"
          @click="selectOption(opt)"
          class="px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors"
          :class="[
            opt.disabled
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : opt.value === modelValue
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          ]"
        >
          <span class="truncate">{{ opt.label }}</span>
          <Check v-if="opt.value === modelValue" class="w-3.5 h-3.5 shrink-0" />
        </li>
      </ul>
    </div>
  </div>
</template>
