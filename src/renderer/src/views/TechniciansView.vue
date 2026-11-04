<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import { ref, onMounted } from 'vue'
import type { Technician } from '@shared/types'
import { useAppStore } from '@renderer/stores/appStore'
import { compressImageFile } from '@renderer/utils/imageHelper'
import { UserCog, UserPlus, Edit3, Trash2, Wallet, Upload, Camera, X } from 'lucide-vue-next'

const appStore = useAppStore()
const technicians = ref<Technician[]>([])
const modalOpen = ref(false)
const payoutModalOpen = ref(false)
const selectedTech = ref<Technician | null>(null)
const payoutAmount = ref(0)
const payoutNotes = ref('')

const form = ref<Partial<Technician>>({
  name: '',
  phone: '',
  specialty: 'غسالات أوتوماتيك وفوق أوتوماتيك',
  commission_rate: 30,
  base_salary: 0,
  is_active: 1,
  notes: '',
  avatar_base64: ''
})

async function loadTechnicians(): Promise<void> {
  technicians.value = await window.api.listTechnicians()
}

async function handleAvatarUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  form.value.avatar_base64 = await compressImageFile(file, 600, 600, 0.85)
  input.value = ''
}

function openCreateModal(): void {
  form.value = {
    name: '',
    phone: '',
    specialty: 'غسالات أوتوماتيك وفوق أوتوماتيك',
    commission_rate: 30,
    base_salary: 0,
    is_active: 1,
    notes: '',
    avatar_base64: ''
  }
  modalOpen.value = true
}

function openEditModal(t: Technician): void {
  form.value = { ...t, avatar_base64: t.avatar_base64 || '' }
  modalOpen.value = true
}

function openPayoutModal(t: Technician): void {
  selectedTech.value = t
  const due = Math.max(0, (t.total_earned_commission || 0) - (t.total_paid_commission || 0))
  payoutAmount.value = Math.round(due)
  payoutNotes.value = `صرف عمولة صيانة للفني: ${t.name}`
  payoutModalOpen.value = true
}

async function handleSaveTechnician(): Promise<void> {
  if (!form.value.name?.trim() || !form.value.phone?.trim()) {
    swalError('بيانات غير مكتملة', 'يرجى إدخال اسم الفني ورقم الهاتف')
    return
  }
  const isEdit = Boolean(form.value.id)
  try {
    await appStore.withLoading(async () => {
      await window.api.saveTechnician(plain(form.value))
      modalOpen.value = false
      await loadTechnicians()
    }, isEdit ? 'جاري حفظ تعديلات الفني...' : 'جاري إضافة الفني الجديد...')
    swalSuccess(isEdit ? 'تم حفظ تعديلات بيانات الفني بنجاح' : 'تمت إضافة الفني الجديد بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حفظ الفني', err instanceof Error ? err.message : '')
  }
}

async function handleConfirmPayout(): Promise<void> {
  if (!selectedTech.value || payoutAmount.value <= 0) return
  try {
    await appStore.withLoading(async () => {
      await window.api.addTreasuryTransaction({
        transaction_type: 'tech_commission',
        category: 'عمولات ويوميات فنيين',
        amount: payoutAmount.value,
        technician_id: selectedTech.value!.id,
        payment_method: 'cash',
        description: payoutNotes.value || `صرف مستحقات الفني ${selectedTech.value!.name}`
      })
      payoutModalOpen.value = false
      await loadTechnicians()
    }, 'جاري صرف العمولة وتسجيلها بالخزينة...')
    swalSuccess('تم صرف العمولة وتسجيلها بالخزينة بنجاح')
  } catch (err: unknown) {
    swalError('تعذر صرف العمولة', err instanceof Error ? err.message : '')
  }
}

async function handleDeleteTechnician(t: Technician): Promise<void> {
  const confirmed = await swalConfirm(
    `حذف الفني (${t.name})؟`,
    'هل أنت متأكد من حذف بيانات هذا الفني؟'
  )
  if (!confirmed) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteTechnician(t.id)
      await loadTechnicians()
    }, 'جاري حذف الفني...')
    swalSuccess('تم حذف الفني بنجاح')
  } catch (err: unknown) {
    swalError('تعذر حذف الفني', err instanceof Error ? err.message : '')
  }
}

onMounted(loadTechnicians)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4"
    >
      <div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <UserCog class="w-5 h-5 text-blue-600" />
          إدارة الفنيين، خطوط السير، ونسب العمولات
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          ملف وصورة كل فني، متابعة الطلبات المفتوحة، عهدة قطع الغيار، وحساب وصرف نسب العمولات تلقائياً
        </p>
      </div>

      <button
        type="button"
        @click="openCreateModal"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
      >
        <UserPlus class="w-4 h-4" />
        إضافة فني جديد
      </button>
    </div>

    <!-- Technicians Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div
        v-for="tech in technicians"
        :key="tech.id"
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
      >
        <div>
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <!-- Technician Avatar -->
              <div
                v-if="tech.avatar_base64"
                @click="appStore.openImagePreview(tech.avatar_base64, tech.name)"
                class="w-14 h-14 rounded-2xl border-2 border-blue-500/40 overflow-hidden shrink-0 cursor-pointer shadow-xs hover:ring-2 hover:ring-blue-500 transition"
                title="اضغط لتكبير صورة الفني"
              >
                <img :src="tech.avatar_base64" :alt="tech.name" class="w-full h-full object-cover" />
              </div>
              <div
                v-else
                @click="openEditModal(tech)"
                class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex flex-col items-center justify-center shrink-0 cursor-pointer shadow-xs"
                title="اضغط لإضافة صورة للفني"
              >
                <span class="font-black text-lg leading-none">{{ tech.name.slice(0, 1) }}</span>
                <Camera class="w-3 h-3 opacity-70 mt-0.5" />
              </div>

              <div>
                <h3 class="font-black text-base text-slate-900 dark:text-white">{{ tech.name }}</h3>
                <p class="text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5">
                  {{ tech.specialty }}
                </p>
                <p class="text-xs text-slate-500 font-mono mt-0.5">📞 {{ tech.phone }}</p>
              </div>
            </div>

            <span
              :class="[
                'px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0',
                tech.is_active
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800'
              ]"
            >
              {{ tech.is_active ? 'متاح بالعمل' : 'موقوف' }}
            </span>
          </div>

          <div
            class="grid grid-cols-2 gap-2.5 mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
          >
            <div>
              <span class="text-slate-500 block">طلبات جارية</span>
              <span class="font-black text-sm text-indigo-600 dark:text-indigo-400">
                {{ tech.active_tickets_count || 0 }} طلب
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">عهدة قطع غيار</span>
              <span class="font-black text-sm text-amber-600">
                {{ tech.custody_parts_count || 0 }} قطعة
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">نسبة العمولة</span>
              <span class="font-black text-sm">{{ tech.commission_rate }}%</span>
            </div>
            <div>
              <span class="text-slate-500 block">الراتب الأساسي</span>
              <span class="font-black text-sm">{{ tech.base_salary }} ج.م</span>
            </div>
          </div>

          <div
            class="mt-3 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1"
          >
            <div class="flex justify-between">
              <span>إجمالي العمولات المستحقة:</span>
              <span class="font-bold">{{ Math.round(tech.total_earned_commission || 0) }} ج.م</span>
            </div>
            <div class="flex justify-between">
              <span>تم صرفه للفني:</span>
              <span class="font-bold">{{ Math.round(tech.total_paid_commission || 0) }} ج.م</span>
            </div>
            <div
              class="flex justify-between border-t border-emerald-200 dark:border-emerald-800 pt-1 font-black text-emerald-800 dark:text-emerald-300"
            >
              <span>الرصيد المتبقي للفني:</span>
              <span>
                {{
                  Math.max(
                    0,
                    Math.round((tech.total_earned_commission || 0) - (tech.total_paid_commission || 0))
                  )
                }}
                ج.م
              </span>
            </div>
          </div>
        </div>

        <div
          class="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs"
        >
          <button
            type="button"
            @click="openPayoutModal(tech)"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
          >
            <Wallet class="w-3.5 h-3.5" />
            صرف عمولة / دفعة
          </button>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              @click="openEditModal(tech)"
              class="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              title="تعديل بيانات وصورة الفني"
            >
              <Edit3 class="w-4 h-4" />
            </button>
            <button
              v-if="appStore.canDeleteRecords"
              type="button"
              @click="handleDeleteTechnician(tech)"
              class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Technician Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">
            {{ form.id ? 'تعديل بيانات وصورة الفني' : 'إضافة فني صيانة جديد' }}
          </h3>
          <button @click="modalOpen = false" class="cursor-pointer"><X class="w-4 h-4" /></button>
        </div>

        <form @submit.prevent="handleSaveTechnician" class="p-6 space-y-3 text-xs">
          <!-- Technician Photo Upload Box -->
          <div
            class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3">
              <div
                v-if="form.avatar_base64"
                @click="appStore.openImagePreview(form.avatar_base64, form.name || 'صورة الفني')"
                class="w-14 h-14 rounded-2xl border-2 border-blue-400 overflow-hidden cursor-pointer shrink-0"
              >
                <img :src="form.avatar_base64" class="w-full h-full object-cover" />
              </div>
              <div
                v-else
                class="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center shrink-0"
              >
                <Camera class="w-6 h-6" />
              </div>
              <div>
                <div class="font-bold text-slate-900 dark:text-white">الصورة الشخصية للفني</div>
                <div class="text-[11px] text-slate-500">تظهر في بطاقة الفني وتقارير العمولات</div>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <label
                class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Upload class="w-3.5 h-3.5" />
                <span>{{ form.avatar_base64 ? 'تغيير' : 'رفع صورة' }}</span>
                <input type="file" accept="image/*" class="hidden" @change="handleAvatarUpload" />
              </label>
              <button
                v-if="form.avatar_base64"
                type="button"
                @click="form.avatar_base64 = ''"
                class="px-2.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold cursor-pointer"
              >
                حذف
              </button>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">اسم الفني / المهندس *</label>
            <input
              v-model="form.name"
              required
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">رقم الموبايل *</label>
            <input
              v-model="form.phone"
              required
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">التخصص الفني</label>
            <input
              v-model="form.specialty"
              type="text"
              placeholder="مثال: غسالات أوتوماتيك / ثلاجات وتكييف / كروت إلكترونية"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نسبة العمولة من المصنعية (%)</label>
              <input
                v-model.number="form.commission_rate"
                type="number"
                min="0"
                max="100"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">الراتب الأساسي الثابت (ج.م)</label>
              <input
                v-model.number="form.base_salary"
                type="number"
                min="0"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              />
            </div>
          </div>
          <div>
            <label class="block font-bold mb-1">الحالة</label>
            <select
              v-model="form.is_active"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option :value="1">نشط بالعمل</option>
              <option :value="0">موقوف / إجازة</option>
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button
              type="button"
              @click="modalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold cursor-pointer"
            >
              حفظ الفني
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Payout Commission Modal -->
    <div
      v-if="payoutModalOpen && selectedTech"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-sm">صرف عمولة / سلفة للفني: {{ selectedTech.name }}</h3>
          <button @click="payoutModalOpen = false" class="cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>
        <form @submit.prevent="handleConfirmPayout" class="p-6 space-y-4">
          <div>
            <label class="block font-bold mb-1">المبلغ المنصرف من الخزينة (ج.م) *</label>
            <input
              v-model.number="payoutAmount"
              type="number"
              min="1"
              required
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-black text-base"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">البيان</label>
            <input
              v-model="payoutNotes"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              @click="payoutModalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer"
            >
              تأكيد الصرف وتسجيله بالخزينة
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
