<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import type { LookupItem, LookupCategory } from '@shared/types'
import {
  ListPlus,
  Plus,
  Edit2,
  Trash2,
  Layers,
  Tag,
  Package
} from 'lucide-vue-next'

const appStore = useAppStore()
const { t } = useTerms()

const activeCategory = ref<LookupCategory>('device_type')
const modalOpen = ref(false)
const editingItem = ref<Partial<LookupItem>>({
  category: 'device_type',
  value: '',
  sort_order: 0,
  is_active: 1
})

const availableCategories = computed<Array<{ key: LookupCategory; label: string; shortLabel: string }>>(() => {
  const base: Array<{ key: LookupCategory; label: string; shortLabel: string }> = [
    { key: 'device_type', label: `أنواع ${t('devices')}`, shortLabel: t('deviceType') },
    { key: 'brand', label: 'الماركات والشركات', shortLabel: t('brand') },
    { key: 'part_category', label: `تصنيفات ${t('parts')}`, shortLabel: t('partCategory') }
  ]

  if (appStore.businessType === 'hearing_aids') {
    base.push(
      { key: 'battery_size', label: 'مقاسات البطاريات', shortLabel: 'مقاس بطارية' },
      { key: 'accessory_type', label: 'أنواع الملحقات', shortLabel: 'نوع ملحق' },
      { key: 'earmold_type', label: 'أنواع القوالب الطبية', shortLabel: 'نوع قالب طبي' },
      { key: 'earmold_material', label: 'خامات القوالب الطبية', shortLabel: 'خامة قالب' },
      { key: 'implant_part', label: 'قطع وأجزاء القوقعة', shortLabel: 'قطعة قوقعة' }
    )
  }

  return base
})

const currentCategoryMeta = computed(
  () => availableCategories.value.find((c) => c.key === activeCategory.value) || availableCategories.value[0]
)

const items = computed(() => {
  return appStore.lookups
    .filter((i) => i.category === activeCategory.value)
    .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value))
})

function openAddModal(): void {
  editingItem.value = {
    category: activeCategory.value,
    value: '',
    sort_order: items.value.length ? Math.max(...items.value.map((i) => i.sort_order)) + 1 : 0,
    is_active: 1
  }
  modalOpen.value = true
}

function openEditModal(item: LookupItem): void {
  editingItem.value = { ...item }
  modalOpen.value = true
}

async function handleSave(): Promise<void> {
  if (!editingItem.value.value?.trim()) {
    swalError('خطأ', 'يرجى كتابة الاسم / القيمة أولاً.')
    return
  }

  try {
    await appStore.withLoading(async () => {
      await window.api.saveLookup({
        ...editingItem.value,
        value: editingItem.value.value!.trim(),
        category: activeCategory.value,
        business_type: appStore.businessType
      })
      await appStore.fetchLookups()
    }, 'جاري حفظ العنصر...')

    modalOpen.value = false
    swalSuccess('تم الحفظ بنجاح!')
  } catch (err: any) {
    swalError('فشل الحفظ', err?.message || 'حدث خطأ أثناء حفظ العنصر.')
  }
}

async function handleDelete(item: LookupItem): Promise<void> {
  const confirmed = await swalConfirm(
    'تأكيد الحذف',
    `هل تريد بالتأكيد حذف "${item.value}" من القائمة؟ السجلات السابقة التي تستخدم هذا الاسم ستحتفظ به.`
  )
  if (!confirmed) return

  try {
    await appStore.withLoading(async () => {
      await window.api.deleteLookup(item.id)
      await appStore.fetchLookups()
    }, 'جاري الحذف...')
    swalSuccess('تم الحذف بنجاح!')
  } catch (err: any) {
    swalError('فشل الحذف', err?.message || 'تعذر حذف العنصر.')
  }
}

async function toggleActive(item: LookupItem): Promise<void> {
  try {
    await window.api.saveLookup({
      ...item,
      is_active: item.is_active ? 0 : 1
    })
    await appStore.fetchLookups()
  } catch (err: any) {
    swalError('خطأ', err?.message || 'تعذر تعديل الحالة.')
  }
}

onMounted(async () => {
  await appStore.fetchLookups()
})
</script>

<template>
  <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ListPlus class="w-5 h-5 text-purple-600" />
          إدارة القوائم والأنواع والماركات
        </h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          تخصيص وإضافة أو تعديل أنواع {{ t('devices') }} وماركات الشركات المصنعة لنشاط {{ appStore.businessProfile.appName }}.
        </p>
      </div>

      <button
        @click="openAddModal"
        class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
      >
        <Plus class="w-4 h-4" />
        إضافة {{ currentCategoryMeta.shortLabel }} جديد
      </button>
    </div>

    <!-- Category Switcher Tabs -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
      <button
        v-for="cat in availableCategories"
        :key="cat.key"
        @click="activeCategory = cat.key"
        :class="[
          'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
          activeCategory === cat.key
            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        ]"
      >
        <Layers v-if="cat.key === 'device_type'" class="w-4 h-4" />
        <Tag v-else-if="cat.key === 'brand'" class="w-4 h-4" />
        <Package v-else class="w-4 h-4" />
        {{ cat.label }} ({{ appStore.lookups.filter((i) => i.category === cat.key).length }})
      </button>
    </div>

    <!-- Items Table / Grid -->
    <div class="overflow-x-auto">
      <table class="w-full text-right text-sm">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold">
            <th class="py-3 px-4 w-16">الترتيب</th>
            <th class="py-3 px-4">الاسم / القيمة</th>
            <th class="py-3 px-4 text-center w-28">الحالة</th>
            <th class="py-3 px-4 text-center w-28">الإجراءات</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
          <tr
            v-for="item in items"
            :key="item.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
          >
            <td class="py-3 px-4 text-slate-400 text-xs font-mono">
              {{ item.sort_order }}
            </td>
            <td class="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
              {{ item.value }}
            </td>
            <td class="py-3 px-4 text-center">
              <button
                @click="toggleActive(item)"
                :class="[
                  'px-2.5 py-1 rounded-full text-xs font-bold transition-all',
                  item.is_active
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                ]"
              >
                {{ item.is_active ? 'نشط' : 'معطل' }}
              </button>
            </td>
            <td class="py-3 px-4 text-center">
              <div class="flex items-center justify-center gap-1">
                <button
                  @click="openEditModal(item)"
                  class="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="تعديل"
                >
                  <Edit2 class="w-4 h-4" />
                </button>
                <button
                  @click="handleDelete(item)"
                  class="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="حذف"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="4" class="py-8 text-center text-slate-400">
              لا توجد عناصر في هذه القائمة حالياً. اضغط "إضافة جديد" لإدخال أول عنصر.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add / Edit Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
        <h4 class="text-base font-bold text-slate-900 dark:text-white">
          {{ editingItem.id ? 'تعديل عنصر' : 'إضافة عنصر جديد' }}
          ({{ currentCategoryMeta.shortLabel }})
        </h4>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              الاسم / القيمة <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="editingItem.value"
              type="text"
              class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
              :placeholder="`اكتب اسم ${currentCategoryMeta.shortLabel}...`"
              autofocus
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ترتيب الظهور في القوائم (رقم)
            </label>
            <input
              v-model.number="editingItem.sort_order"
              type="number"
              class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
            />
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              id="lookupActive"
              type="checkbox"
              :checked="Boolean(editingItem.is_active)"
              @change="editingItem.is_active = ($event.target as HTMLInputElement).checked ? 1 : 0"
              class="w-4 h-4 text-purple-600 rounded border-slate-300"
            />
            <label for="lookupActive" class="text-sm font-semibold text-slate-700 dark:text-slate-300">
              تفعيل هذا العنصر وإظهاره في القوائم المنسدلة
            </label>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button
            @click="modalOpen = false"
            class="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            إلغاء
          </button>
          <button
            @click="handleSave"
            class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
          >
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

