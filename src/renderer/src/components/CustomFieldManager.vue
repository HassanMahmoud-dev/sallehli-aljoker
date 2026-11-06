<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useTerms } from '@renderer/composables/useTerms'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import type { CustomFieldDef, CustomFieldEntity, CustomFieldType } from '@shared/types'
import {
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Layers,
  Users,
  Wrench,
  X
} from 'lucide-vue-next'

const appStore = useAppStore()
const { t } = useTerms()

const activeEntity = ref<CustomFieldEntity>('device')
const modalOpen = ref(false)
const optionsText = ref('')

const editingField = ref<Partial<CustomFieldDef>>({
  entity: 'device',
  key: '',
  label: '',
  type: 'text',
  options: [],
  required: 0,
  show_in_table: 0,
  sort_order: 1,
  is_active: 1
})

const entityTabs = computed<Array<{ key: CustomFieldEntity; label: string; shortLabel: string }>>(() => [
  { key: 'device', label: `حقول ${t('devices')}`, shortLabel: t('device') },
  { key: 'customer', label: `حقول ${t('customers')}`, shortLabel: t('customer') },
  { key: 'ticket', label: `حقول ${t('tickets')}`, shortLabel: t('ticket') }
])

const fieldTypeLabels: Record<CustomFieldType, string> = {
  text: 'نص قصير (Text)',
  number: 'رقم (Number)',
  date: 'تاريخ (Date)',
  select: 'قائمة منسدلة (Select)',
  boolean: 'نعم / لا (Boolean)',
  textarea: 'نص طويل / ملاحظات (Textarea)'
}

const currentEntityMeta = computed(
  () => entityTabs.value.find((e) => e.key === activeEntity.value) || entityTabs.value[0]
)

const items = computed(() =>
  appStore.customFieldDefs
    .filter((f) => f.entity === activeEntity.value)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
)

function openAddModal(): void {
  const maxOrder = items.value.length ? Math.max(...items.value.map((i) => i.sort_order)) : 0
  editingField.value = {
    entity: activeEntity.value,
    key: '',
    label: '',
    type: 'text',
    options: [],
    required: 0,
    show_in_table: 1,
    sort_order: maxOrder + 1,
    is_active: 1
  }
  optionsText.value = ''
  modalOpen.value = true
}

function openEditModal(field: CustomFieldDef): void {
  editingField.value = {
    ...field,
    options: Array.isArray(field.options) ? [...field.options] : []
  }
  optionsText.value = (field.options || []).join('\n')
  modalOpen.value = true
}

async function handleSave(): Promise<void> {
  if (!editingField.value.label?.trim()) {
    swalError('بيانات ناقصة', 'يرجى إدخال عنوان الحقل الظاهر للمستخدم.')
    return
  }

  const parsedOptions =
    editingField.value.type === 'select'
      ? optionsText.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : []

  if (editingField.value.type === 'select' && parsedOptions.length === 0) {
    swalError('خيارات القائمة مطلوبة', 'يرجى كتابة خيار واحد على الأقل للقائمة المنسدلة (كل خيار في سطر).')
    return
  }

  try {
    await appStore.withLoading(async () => {
      await window.api.saveCustomField({
        ...editingField.value,
        entity: activeEntity.value,
        label: editingField.value.label!.trim(),
        options: parsedOptions,
        business_type: appStore.businessType
      })
      await appStore.fetchCustomFields()
    }, 'جاري حفظ الحقل المخصص...')

    modalOpen.value = false
    swalSuccess('تم حفظ الحقل المخصص بنجاح!')
  } catch (err: any) {
    swalError('تعذر حفظ الحقل', err?.message || 'حدث خطأ أثناء حفظ تعريف الحقل.')
  }
}

async function handleDelete(field: CustomFieldDef): Promise<void> {
  const confirmed = await swalConfirm(
    `حذف الحقل "${field.label}"؟`,
    'سيتم إزالة تعريف الحقل من النماذج، مع بقاء البيانات المسجلة سابقاً محفوظة في السجلات القديمة.'
  )
  if (!confirmed) return

  try {
    await appStore.withLoading(async () => {
      await window.api.deleteCustomField(field.id)
      await appStore.fetchCustomFields()
    }, 'جاري حذف الحقل...')
    swalSuccess('تم حذف الحقل بنجاح!')
  } catch (err: any) {
    swalError('فشل الحذف', err?.message || 'تعذر حذف الحقل.')
  }
}

async function toggleActive(field: CustomFieldDef): Promise<void> {
  try {
    await window.api.saveCustomField({
      ...field,
      is_active: field.is_active ? 0 : 1
    })
    await appStore.fetchCustomFields()
  } catch (err: any) {
    swalError('خطأ', err?.message || 'تعذر تعديل حالة الحقل.')
  }
}

async function toggleShowInTable(field: CustomFieldDef): Promise<void> {
  try {
    await window.api.saveCustomField({
      ...field,
      show_in_table: field.show_in_table ? 0 : 1
    })
    await appStore.fetchCustomFields()
  } catch (err: any) {
    swalError('خطأ', err?.message || 'تعذر تعديل إظهار الحقل في الجدول.')
  }
}

onMounted(async () => {
  await appStore.fetchCustomFields()
})
</script>

<template>
  <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Sliders class="w-5 h-5 text-indigo-600" />
          إدارة الحقول المخصصة للقطاع ({{ appStore.businessProfile.appName }})
        </h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          إضافة وتخصيص حقول إضافية في نماذج {{ t('devices') }} و{{ t('customers') }} و{{ t('tickets') }} مع دعم البحث والطباعة وإظهارها في الجداول.
        </p>
      </div>

      <button
        type="button"
        @click="openAddModal"
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer"
      >
        <Plus class="w-4 h-4" />
        إضافة حقل لـ {{ currentEntityMeta.shortLabel }}
      </button>
    </div>

    <!-- Entity Switcher Tabs -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
      <button
        v-for="tab in entityTabs"
        :key="tab.key"
        type="button"
        @click="activeEntity = tab.key"
        :class="[
          'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
          activeEntity === tab.key
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        ]"
      >
        <Layers v-if="tab.key === 'device'" class="w-4 h-4" />
        <Users v-else-if="tab.key === 'customer'" class="w-4 h-4" />
        <Wrench v-else class="w-4 h-4" />
        {{ tab.label }} ({{ appStore.customFieldDefs.filter((f) => f.entity === tab.key).length }})
      </button>
    </div>

    <!-- Fields Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-right text-sm">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold">
            <th class="py-3 px-3 w-14">الترتيب</th>
            <th class="py-3 px-3">اسم الحقل</th>
            <th class="py-3 px-3">نوع الحقل</th>
            <th class="py-3 px-3 text-center">إلزامي</th>
            <th class="py-3 px-3 text-center">إظهار بالجدول</th>
            <th class="py-3 px-3 text-center">الحالة</th>
            <th class="py-3 px-3 text-center w-24">الإجراءات</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50 text-xs">
          <tr
            v-for="field in items"
            :key="field.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
          >
            <td class="py-3 px-3 text-slate-400 font-mono">
              {{ field.sort_order }}
            </td>
            <td class="py-3 px-3">
              <div class="font-bold text-slate-800 dark:text-slate-200">{{ field.label }}</div>
              <div class="text-[10px] text-slate-400 font-mono">{{ field.key }}</div>
            </td>
            <td class="py-3 px-3">
              <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                {{ fieldTypeLabels[field.type] || field.type }}
              </span>
              <div v-if="field.type === 'select' && field.options.length" class="text-[10px] text-slate-500 mt-1 truncate max-w-xs">
                الخيارات: {{ field.options.join(' ، ') }}
              </div>
            </td>
            <td class="py-3 px-3 text-center">
              <span
                :class="[
                  'px-2 py-0.5 rounded-full text-[11px] font-bold',
                  field.required
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                ]"
              >
                {{ field.required ? 'إلزامي *' : 'اختياري' }}
              </span>
            </td>
            <td class="py-3 px-3 text-center">
              <button
                type="button"
                @click="toggleShowInTable(field)"
                :class="[
                  'px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer',
                  field.show_in_table
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                ]"
              >
                {{ field.show_in_table ? 'يظهر بالجدول' : 'مخفي بالجدول' }}
              </button>
            </td>
            <td class="py-3 px-3 text-center">
              <button
                type="button"
                @click="toggleActive(field)"
                :class="[
                  'px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer',
                  field.is_active
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                ]"
              >
                {{ field.is_active ? 'نشط' : 'معطل' }}
              </button>
            </td>
            <td class="py-3 px-3 text-center">
              <div class="flex items-center justify-center gap-1">
                <button
                  type="button"
                  @click="openEditModal(field)"
                  class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  title="تعديل"
                >
                  <Edit2 class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  @click="handleDelete(field)"
                  class="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  title="حذف"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="7" class="py-8 text-center text-slate-400">
              لا توجد حقول مخصصة مسجلة لـ {{ currentEntityMeta.shortLabel }} في هذا القطاع حالياً. يمكنك إضافة حقل جديد من الزر أعلاه.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add / Edit Custom Field Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 text-xs"
    >
      <div class="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
          <h4 class="text-sm font-black text-slate-900 dark:text-white">
            {{ editingField.id ? 'تعديل حقل مخصص' : 'إضافة حقل مخصص جديد' }}
            ({{ currentEntityMeta.shortLabel }})
          </h4>
          <button type="button" @click="modalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block font-bold mb-1">عنوان الحقل الظاهر *</label>
            <input
              v-model="editingField.label"
              type="text"
              placeholder="مثال: جهة الأذن / الرقم التسلسلي / رقم التأمين..."
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نوع الحقل *</label>
              <select
                v-model="editingField.type"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="(lbl, tKey) in fieldTypeLabels" :key="tKey" :value="tKey">
                  {{ lbl }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">ترتيب الظهور</label>
              <input
                v-model.number="editingField.sort_order"
                type="number"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <div v-if="editingField.type === 'select'">
            <label class="block font-bold mb-1">خيارات القائمة المنسدلة (كل خيار في سطر مستقل) *</label>
            <textarea
              v-model="optionsText"
              rows="4"
              placeholder="يمين&#10;يسار&#10;الاثنان معاً"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 leading-relaxed"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-1">
            <label class="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                :checked="Boolean(editingField.required)"
                @change="(e) => (editingField.required = (e.target as HTMLInputElement).checked ? 1 : 0)"
                class="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
              <span class="font-bold">حقل إلزامي (*)</span>
            </label>

            <label class="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                :checked="Boolean(editingField.show_in_table)"
                @change="(e) => (editingField.show_in_table = (e.target as HTMLInputElement).checked ? 1 : 0)"
                class="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
              <span class="font-bold">إظهار بالجدول</span>
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            @click="modalOpen = false"
            class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            @click="handleSave"
            class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
          >
            حفظ الحقل
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
