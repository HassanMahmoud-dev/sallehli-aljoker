<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { ref, onMounted, watch } from 'vue'
import type { SparePart, InventoryMovement, Technician } from '@shared/types'
import { PART_CATEGORIES } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
import { compressImageFile } from '@renderer/utils/imageHelper'
import {
  Package,
  PlusCircle,
  Search,
  Edit3,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Image as ImageIcon,
  Upload,
  X
} from 'lucide-vue-next'

const appStore = useAppStore()
const parts = ref<SparePart[]>([])
const movements = ref<InventoryMovement[]>([])
const technicians = ref<Technician[]>([])
const searchQuery = ref('')
const activeTab = ref<'parts' | 'movements'>('parts')

const partModalOpen = ref(false)
const moveModalOpen = ref(false)

const partForm = ref<Partial<SparePart>>({
  code: '',
  name: '',
  category: PART_CATEGORIES[0],
  brand: 'عام',
  purchase_price: 0,
  selling_price: 0,
  quantity: 5,
  min_quantity: 3,
  location: '',
  notes: '',
  image_base64: ''
})

const moveForm = ref<{
  part_id: number
  technician_id: number | null
  movement_type: InventoryMovement['movement_type']
  quantity: number
  notes: string
  recordInTreasury: boolean
}>({
  part_id: 0,
  technician_id: null,
  movement_type: 'in',
  quantity: 1,
  notes: '',
  recordInTreasury: true
})

async function loadData(): Promise<void> {
  const [pList, mList, tList] = await Promise.all([
    window.api.listSpareParts(searchQuery.value),
    window.api.listInventoryMovements(),
    window.api.listTechnicians()
  ])
  parts.value = pList
  movements.value = mList
  technicians.value = tList
}

watch(searchQuery, () => {
  loadData()
})

async function handlePartImageUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  partForm.value.image_base64 = await compressImageFile(file, 900, 900, 0.82)
  input.value = ''
}

function openCreatePartModal(): void {
  partForm.value = {
    code: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    category: PART_CATEGORIES[0],
    brand: 'عام',
    purchase_price: 0,
    selling_price: 0,
    quantity: 5,
    min_quantity: 3,
    location: '',
    notes: '',
    image_base64: ''
  }
  partModalOpen.value = true
}

function openEditPartModal(p: SparePart): void {
  partForm.value = { ...p, image_base64: p.image_base64 || '' }
  partModalOpen.value = true
}

function openMovementModal(p: SparePart, type: InventoryMovement['movement_type'] = 'in'): void {
  moveForm.value = {
    part_id: p.id,
    technician_id: technicians.value[0]?.id || null,
    movement_type: type,
    quantity: 1,
    notes: '',
    recordInTreasury: type === 'in'
  }
  moveModalOpen.value = true
}

async function handleSavePart(): Promise<void> {
  if (!partForm.value.name?.trim()) {
    alert('يرجى إدخال اسم قطعة الغيار')
    return
  }
  await window.api.saveSparePart(plain(partForm.value))
  partModalOpen.value = false
  await loadData()
}

async function handleRecordMovement(): Promise<void> {
  try {
    await window.api.recordInventoryMovement(plain(moveForm.value))
    moveModalOpen.value = false
    await loadData()
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : 'تعذر تسجيل حركة المخزن')
  }
}

async function handleDeletePart(p: SparePart): Promise<void> {
  if (!confirm(`هل أنت متأكد من حذف الصنف "${p.name}"؟`)) return
  try {
    await window.api.deleteSparePart(p.id)
    await loadData()
  } catch {
    alert('لا يمكن حذف قطعة غيار مستخدمة في طلبات صيانة سابقة')
  }
}

const movementTypeLabels: Record<string, { label: string; badge: string }> = {
  in: { label: 'توريد وشراء للمخزن (+)', badge: 'bg-emerald-100 text-emerald-800' },
  custody_issue: { label: 'صرف عهدة لفني (-)', badge: 'bg-amber-100 text-amber-800' },
  custody_return: { label: 'مرتجع عهدة من فني (+)', badge: 'bg-blue-100 text-blue-800' },
  damaged: { label: 'تالف / هالك (-)', badge: 'bg-rose-100 text-rose-800' },
  out_ticket: { label: 'منصرف لطلب صيانة (-)', badge: 'bg-indigo-100 text-indigo-800' }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4"
    >
      <div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Package class="w-5 h-5 text-blue-600" />
          مخزن قطع الغيار وعهدة الفنيين
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          إدارة أرصدة وصور قطع الغيار، أسعار الشراء والبيع، تنبيهات النواقص، وصرف واستلام عهدة الفنيين
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
          <button
            type="button"
            @click="activeTab = 'parts'"
            :class="[
              'px-3.5 py-1.5 rounded-lg transition cursor-pointer',
              activeTab === 'parts'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300'
            ]"
          >
            أصناف المخزن ({{ parts.length }})
          </button>
          <button
            type="button"
            @click="activeTab = 'movements'"
            :class="[
              'px-3.5 py-1.5 rounded-lg transition cursor-pointer',
              activeTab === 'movements'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300'
            ]"
          >
            سجل حركات الصرف والتوريد
          </button>
        </div>

        <button
          type="button"
          @click="openCreatePartModal"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
        >
          <PlusCircle class="w-4 h-4" />
          إضافة قطعة غيار جديدة
        </button>
      </div>
    </div>

    <!-- Search Bar -->
    <div v-if="activeTab === 'parts'" class="relative max-w-md text-xs">
      <Search
        class="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
      />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="بحث بكود القطعة، الاسم، التصنيف، أو الماركة..."
        class="w-full pr-10 pl-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      />
    </div>

    <!-- TAB 1: Spare Parts Table -->
    <div
      v-if="activeTab === 'parts'"
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <table class="w-full text-right text-xs">
        <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold">
          <tr>
            <th class="py-3.5 px-4">الصورة</th>
            <th class="py-3.5 px-4">الكود</th>
            <th class="py-3.5 px-4">اسم قطعة الغيار</th>
            <th class="py-3.5 px-4">التصنيف والماركة</th>
            <th v-if="appStore.canViewPurchasePrices" class="py-3.5 px-4">سعر الشراء</th>
            <th class="py-3.5 px-4">سعر البيع للعميل</th>
            <th class="py-3.5 px-4">الرصيد المتاح</th>
            <th class="py-3.5 px-4">المكان</th>
            <th class="py-3.5 px-4">حركات المخزن والإجراءات</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr
            v-for="p in parts"
            :key="p.id"
            class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <td class="py-2.5 px-4">
              <div
                v-if="p.image_base64"
                @click="appStore.openImagePreview(p.image_base64, `${p.name} (${p.code})`)"
                class="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition bg-white"
                title="اضغط لتكبير صورة قطعة الغيار"
              >
                <img :src="p.image_base64" :alt="p.name" class="w-full h-full object-cover" />
              </div>
              <div
                v-else
                class="w-11 h-11 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-400"
              >
                <ImageIcon class="w-4 h-4" />
              </div>
            </td>
            <td class="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
              {{ p.code }}
            </td>
            <td class="py-3.5 px-4 font-bold text-slate-900 dark:text-white text-sm">
              {{ p.name }}
            </td>
            <td class="py-3.5 px-4">
              <div class="font-bold">{{ p.category }}</div>
              <div class="text-slate-500">{{ p.brand }}</div>
            </td>
            <td v-if="appStore.canViewPurchasePrices" class="py-3.5 px-4 font-semibold">
              {{ p.purchase_price }} ج.م
            </td>
            <td class="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
              {{ p.selling_price }} ج.م
            </td>
            <td class="py-3.5 px-4">
              <span
                :class="[
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black',
                  p.quantity <= p.min_quantity
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                ]"
              >
                <AlertTriangle v-if="p.quantity <= p.min_quantity" class="w-3.5 h-3.5" />
                {{ p.quantity }} قطعة
              </span>
            </td>
            <td class="py-3.5 px-4 text-slate-500">{{ p.location || '—' }}</td>
            <td class="py-3.5 px-4">
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  @click="openMovementModal(p, 'in')"
                  class="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  title="توريد كمية للمخزن"
                >
                  <ArrowDownLeft class="w-3.5 h-3.5" /> توريد
                </button>
                <button
                  type="button"
                  @click="openMovementModal(p, 'custody_issue')"
                  class="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                  title="صرف عهدة لفني"
                >
                  <ArrowUpRight class="w-3.5 h-3.5" /> عهدة فني
                </button>
                <button
                  type="button"
                  @click="openEditPartModal(p)"
                  class="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                >
                  <Edit3 class="w-4 h-4" />
                </button>
                <button
                  v-if="appStore.canDeleteRecords"
                  type="button"
                  @click="handleDeletePart(p)"
                  class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TAB 2: Inventory Movements History -->
    <div
      v-else
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <table class="w-full text-right text-xs">
        <thead class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold">
          <tr>
            <th class="py-3.5 px-4">التاريخ</th>
            <th class="py-3.5 px-4">قطعة الغيار</th>
            <th class="py-3.5 px-4">نوع الحركة</th>
            <th class="py-3.5 px-4">الكمية</th>
            <th class="py-3.5 px-4">الفني المرتبط</th>
            <th class="py-3.5 px-4">ملاحظات</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          <tr v-for="m in movements" :key="m.id">
            <td class="py-3 px-4 font-mono text-slate-500">{{ m.created_at }}</td>
            <td class="py-3 px-4 font-bold">{{ m.part_name }} ({{ m.part_code }})</td>
            <td class="py-3 px-4">
              <span
                :class="[
                  'px-2.5 py-1 rounded-full font-bold text-[11px]',
                  movementTypeLabels[m.movement_type]?.badge
                ]"
              >
                {{ movementTypeLabels[m.movement_type]?.label || m.movement_type }}
              </span>
            </td>
            <td class="py-3 px-4 font-black">{{ m.quantity }}</td>
            <td class="py-3 px-4 font-semibold">{{ m.technician_name || '—' }}</td>
            <td class="py-3 px-4 text-slate-500">{{ m.notes || '—' }}</td>
          </tr>
          <tr v-if="movements.length === 0">
            <td colspan="6" class="py-8 text-center text-slate-400">
              لا توجد حركات مخزنية مسجلة بعد
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add / Edit Part Modal -->
    <div
      v-if="partModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden text-xs"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">
            {{ partForm.id ? 'تعديل بيانات قطعة الغيار' : 'إضافة قطعة غيار جديدة للمخزن' }}
          </h3>
          <button @click="partModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleSavePart" class="p-6 space-y-3">
          <!-- Spare Part Image Attachment -->
          <div
            class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4"
          >
            <div class="flex items-center gap-3">
              <div
                v-if="partForm.image_base64"
                @click="appStore.openImagePreview(partForm.image_base64, partForm.name || 'صورة قطعة الغيار')"
                class="w-16 h-16 rounded-xl border border-blue-300 overflow-hidden bg-white cursor-pointer shrink-0"
              >
                <img :src="partForm.image_base64" class="w-full h-full object-cover" />
              </div>
              <div
                v-else
                class="w-16 h-16 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 shrink-0"
              >
                <ImageIcon class="w-6 h-6" />
              </div>
              <div>
                <div class="font-bold text-slate-900 dark:text-white">صورة قطعة الغيار</div>
                <div class="text-[11px] text-slate-500">
                  أرفق صورة واضحة للقطعة لسهولة التعرف عليها في المخزن
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <label
                class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload class="w-3.5 h-3.5" />
                <span>{{ partForm.image_base64 ? 'تغيير الصورة' : 'إرفاق صورة' }}</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handlePartImageUpload"
                />
              </label>
              <button
                v-if="partForm.image_base64"
                type="button"
                @click="partForm.image_base64 = ''"
                class="px-2.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold cursor-pointer"
              >
                حذف
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">كود القطعة *</label>
              <input
                v-model="partForm.code"
                required
                type="text"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">التصنيف *</label>
              <select
                v-model="partForm.category"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-for="c in PART_CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">اسم وبيان قطعة الغيار *</label>
            <input
              v-model="partForm.name"
              required
              type="text"
              placeholder="مثال: طلمبة طرد غسالة أوتوماتيك إل جي أصلية"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">الماركة المتوافقة</label>
              <input
                v-model="partForm.brand"
                type="text"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">مكان الرف بالمخزن</label>
              <input
                v-model="partForm.location"
                type="text"
                placeholder="رف A1"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-4 gap-3">
            <div>
              <label class="block font-bold mb-1">سعر الشراء</label>
              <input
                v-model.number="partForm.purchase_price"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">سعر البيع</label>
              <input
                v-model.number="partForm.selling_price"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">الكمية الحالية</label>
              <input
                v-model.number="partForm.quantity"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">حد النواقص</label>
              <input
                v-model.number="partForm.min_quantity"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3">
            <button
              type="button"
              @click="partModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
            >
              حفظ الصنف
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Stock Movement / Custody Modal -->
    <div
      v-if="moveModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">تسجيل حركة مخزن / عهدة فني</h3>
          <button @click="moveModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleRecordMovement" class="p-6 space-y-3">
          <div>
            <label class="block font-bold mb-1">نوع الحركة *</label>
            <select
              v-model="moveForm.movement_type"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option value="in">توريد وشراء جديد للمخزن (+)</option>
              <option value="custody_issue">صرف عهدة لفني (-)</option>
              <option value="custody_return">إرجاع عهدة سليمة من فني للمخزن (+)</option>
              <option value="damaged">تسجيل قطعة تالفة / مرتجع تالف (-)</option>
            </select>
          </div>

          <div
            v-if="
              moveForm.movement_type === 'custody_issue' ||
              moveForm.movement_type === 'custody_return'
            "
          >
            <label class="block font-bold mb-1">الفني المستلم / المسلم *</label>
            <select
              v-model="moveForm.technician_id"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option v-for="t in technicians" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>

          <div>
            <label class="block font-bold mb-1">الكمية *</label>
            <input
              v-model.number="moveForm.quantity"
              type="number"
              min="1"
              required
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>

          <div v-if="moveForm.movement_type === 'in'" class="flex items-center gap-2 pt-1">
            <input
              id="recTreasury"
              v-model="moveForm.recordInTreasury"
              type="checkbox"
              class="w-4 h-4"
            />
            <label for="recTreasury" class="font-bold">
              تسجيل تكلفة الشراء كمصروف في الخزينة تلقائياً
            </label>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات</label>
            <input
              v-model="moveForm.notes"
              type="text"
              placeholder="اسم المورد أو سبب الصرف..."
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div class="flex justify-end gap-2 pt-3">
            <button
              type="button"
              @click="moveModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
            >
              تنفيذ الحركة
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
