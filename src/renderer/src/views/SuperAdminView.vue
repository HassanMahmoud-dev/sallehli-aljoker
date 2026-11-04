<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { User, UserRole } from '@shared/types'
import { USER_ROLE_LABELS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
import {
  ShieldCheck,
  UserPlus,
  Edit3,
  Trash2,
  CalendarClock,
  CheckCircle,
  XCircle,
  KeyRound
} from 'lucide-vue-next'

const appStore = useAppStore()
const users = ref<User[]>([])
const modalOpen = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const visibleUsers = computed(() => {
  if (appStore.isSuperAdmin) return users.value
  return users.value.filter((u) => u.role !== 'super_admin')
})

const form = ref<{
  id?: number
  username: string
  password: string
  full_name: string
  phone: string
  role: UserRole
  is_active: number
  subscription_start: string
  subscription_end: string
  notes: string
}>({
  username: '',
  password: '',
  full_name: '',
  phone: '',
  role: 'tenant',
  is_active: 1,
  subscription_start: new Date().toISOString().slice(0, 10),
  subscription_end: '',
  notes: ''
})

async function loadUsers(): Promise<void> {
  users.value = await window.api.listUsers()
}

function openCreateModal(): void {
  errorMsg.value = ''
  const today = new Date()
  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  form.value = {
    username: '',
    password: '',
    full_name: '',
    phone: '',
    role: appStore.isSuperAdmin ? 'tenant' : 'receptionist',
    is_active: 1,
    subscription_start: today.toISOString().slice(0, 10),
    subscription_end: nextMonth.toISOString().slice(0, 10),
    notes: ''
  }
  modalOpen.value = true
}

function openEditModal(u: User): void {
  errorMsg.value = ''
  form.value = {
    id: u.id,
    username: u.username,
    password: '',
    full_name: u.full_name,
    phone: u.phone || '',
    role: u.role,
    is_active: u.is_active,
    subscription_start: u.subscription_start || new Date().toISOString().slice(0, 10),
    subscription_end: u.subscription_end || '',
    notes: u.notes || ''
  }
  modalOpen.value = true
}

function setQuickSubscriptionMonths(months: number): void {
  const start = form.value.subscription_start
    ? new Date(form.value.subscription_start)
    : new Date()
  const end = new Date(start)
  end.setMonth(end.getMonth() + months)
  form.value.subscription_end = end.toISOString().slice(0, 10)
}

async function extendTenantSubscription(user: User, months: number): Promise<void> {
  const baseDate =
    user.subscription_end && new Date(user.subscription_end) > new Date()
      ? new Date(user.subscription_end)
      : new Date()
  baseDate.setMonth(baseDate.getMonth() + months)
  const newEnd = baseDate.toISOString().slice(0, 10)

  await window.api.saveUser({
    ...user,
    is_active: 1,
    subscription_start: user.subscription_start || new Date().toISOString().slice(0, 10),
    subscription_end: newEnd
  })
  successMsg.value = `تم تجديد اشتراك المستأجر (${user.full_name}) لمدة ${months} شهر حتى تاريخ ${newEnd}`
  await loadUsers()
}

async function handleSaveUser(): Promise<void> {
  errorMsg.value = ''
  if (!form.value.username.trim() || !form.value.full_name.trim()) {
    errorMsg.value = 'يرجى إدخال اسم المستخدم والاسم الكامل'
    return
  }
  if (!form.value.id && !form.value.password.trim()) {
    errorMsg.value = 'يرجى تحديد كلمة مرور للمستخدم الجديد'
    return
  }
  if (form.value.role === 'tenant' && !form.value.subscription_end) {
    errorMsg.value = 'يرجى تحديد تاريخ انتهاء الاشتراك لحساب مستأجر البرنامج'
    return
  }

  try {
    await window.api.saveUser({
      ...form.value,
      subscription_start: form.value.role === 'tenant' ? form.value.subscription_start : null,
      subscription_end: form.value.role === 'tenant' ? form.value.subscription_end : null
    })
    modalOpen.value = false
    successMsg.value = 'تم حفظ بيانات المستخدم والصلاحية بنجاح'
    await loadUsers()
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'تعذر حفظ المستخدم (ربما اسم المستخدم مكرر)'
  }
}

async function handleDeleteUser(user: User): Promise<void> {
  if (user.username === 'admin') return
  if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.full_name}"؟`)) return
  try {
    await window.api.deleteUser(user.id)
    await loadUsers()
  } catch (err: unknown) {
    alert(err instanceof Error ? err.message : 'فشل الحذف')
  }
}

function getTenantDaysStatus(user: User): { text: string; color: string } {
  if (user.role !== 'tenant') {
    return { text: 'ترخيص دائم (غير محدد بمدة)', color: 'text-emerald-600 dark:text-emerald-400' }
  }
  if (!user.subscription_end) {
    return { text: 'بدون تاريخ انتهاء', color: 'text-rose-600' }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(user.subscription_end)
  end.setHours(23, 59, 59, 999)
  const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) {
    return {
      text: `منتهي منذ ${Math.abs(days)} يوم (${user.subscription_end})`,
      color: 'text-rose-600 dark:text-rose-400 font-bold'
    }
  }
  if (days <= 7) {
    return {
      text: `متبقي ${days} أيام فقط (ينتهي ${user.subscription_end})`,
      color: 'text-amber-600 dark:text-amber-400 font-bold'
    }
  }
  return {
    text: `ساري - متبقي ${days} يوم (ينتهي ${user.subscription_end})`,
    color: 'text-blue-600 dark:text-blue-400 font-semibold'
  }
}

onMounted(loadUsers)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-l from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg"
    >
      <div class="flex items-center gap-3.5">
        <div class="p-3 rounded-2xl bg-white/10 border border-white/20">
          <ShieldCheck class="w-8 h-8 text-purple-300" />
        </div>
        <div>
          <h1 class="text-xl font-black">
            لوحة تحكم السوبر أدمن (إدارة التراخيص والمالكين والمستأجرين)
          </h1>
          <p class="text-xs text-purple-200 mt-1">
            تحكم كامل في حسابات مالكي البرنامج (النسخ الدائمة) ومستأجري البرنامج (بنظام الاشتراك الشهري/السنوي)
          </p>
        </div>
      </div>

      <button
        type="button"
        @click="openCreateModal"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-950 hover:bg-purple-50 font-black text-xs shadow-md transition cursor-pointer"
      >
        <UserPlus class="w-4 h-4" />
        إضافة مستخدم / ترخيص جديد
      </button>
    </div>

    <!-- Role Explanation Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        v-for="(info, roleKey) in USER_ROLE_LABELS"
        :key="roleKey"
        class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
      >
        <span :class="['inline-block px-3 py-1 rounded-full text-xs font-bold mb-2', info.badge]">
          {{ info.label }}
        </span>
        <p class="text-xs text-slate-600 dark:text-slate-400">{{ info.desc }}</p>
      </div>
    </div>

    <div
      v-if="successMsg"
      class="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between"
    >
      <span>{{ successMsg }}</span>
      <button @click="successMsg = ''" class="text-xs underline cursor-pointer">إغلاق</button>
    </div>

    <!-- Users & Licenses Table -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-right text-sm">
          <thead
            class="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold"
          >
            <tr>
              <th class="py-3.5 px-4">#</th>
              <th class="py-3.5 px-4">اسم المستخدم</th>
              <th class="py-3.5 px-4">الاسم الكامل</th>
              <th class="py-3.5 px-4">نوع الصلاحية / الترخيص</th>
              <th class="py-3.5 px-4">حالة الاشتراك والمدة</th>
              <th class="py-3.5 px-4">الحالة</th>
              <th class="py-3.5 px-4">تجديد سريع للمستأجر</th>
              <th class="py-3.5 px-4">إجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <tr
              v-for="u in visibleUsers"
              :key="u.id"
              class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
            >
              <td class="py-3.5 px-4 font-bold">{{ u.id }}</td>
              <td class="py-3.5 px-4 font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                {{ u.username }}
              </td>
              <td class="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                {{ u.full_name }}
                <div v-if="u.phone" class="text-[11px] text-slate-500 font-normal">
                  {{ u.phone }}
                </div>
              </td>
              <td class="py-3.5 px-4">
                <span
                  :class="[
                    'px-2.5 py-1 rounded-full text-[11px] font-bold',
                    USER_ROLE_LABELS[u.role]?.badge
                  ]"
                >
                  {{ USER_ROLE_LABELS[u.role]?.label }}
                </span>
              </td>
              <td class="py-3.5 px-4">
                <span :class="getTenantDaysStatus(u).color">
                  {{ getTenantDaysStatus(u).text }}
                </span>
              </td>
              <td class="py-3.5 px-4">
                <span
                  v-if="u.is_active"
                  class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"
                >
                  <CheckCircle class="w-4 h-4" /> نشط
                </span>
                <span v-else class="inline-flex items-center gap-1 text-rose-600 font-bold">
                  <XCircle class="w-4 h-4" /> موقوف
                </span>
              </td>
              <td class="py-3.5 px-4">
                <div v-if="u.role === 'tenant'" class="flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="extendTenantSubscription(u, 1)"
                    class="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-[11px] transition cursor-pointer"
                  >
                    + شهر
                  </button>
                  <button
                    type="button"
                    @click="extendTenantSubscription(u, 6)"
                    class="px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-bold text-[11px] transition cursor-pointer"
                  >
                    + 6 شهور
                  </button>
                  <button
                    type="button"
                    @click="extendTenantSubscription(u, 12)"
                    class="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] transition cursor-pointer"
                  >
                    + سنة
                  </button>
                </div>
                <span v-else class="text-slate-400">—</span>
              </td>
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    @click="openEditModal(u)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                    title="تعديل"
                  >
                    <Edit3 class="w-4 h-4" />
                  </button>
                  <button
                    v-if="u.username !== 'admin'"
                    type="button"
                    @click="handleDeleteUser(u)"
                    class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / Edit User Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div
        class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div
          class="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
          <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound class="w-5 h-5 text-purple-600" />
            <span>{{ form.id ? 'تعديل حساب وصلاحية مستخدم' : 'إنشاء مستخدم وترخيص جديد' }}</span>
          </h3>
          <button
            type="button"
            @click="modalOpen = false"
            class="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form @submit.prevent="handleSaveUser" class="p-6 space-y-4 text-xs">
          <div
            v-if="errorMsg"
            class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-600 font-bold"
          >
            {{ errorMsg }}
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">اسم المستخدم (لتسجيل الدخول) *</label>
              <input
                v-model="form.username"
                :disabled="form.username === 'admin'"
                type="text"
                required
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">
                {{ form.id ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *' }}
              </label>
              <input
                v-model="form.password"
                type="text"
                :placeholder="form.id ? 'بدون تغيير' : 'مثال: 123456'"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">الاسم الكامل / اسم المركز *</label>
              <input
                v-model="form.full_name"
                type="text"
                required
                placeholder="مثال: م. حسن - مالك المركز"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label class="block font-bold mb-1">رقم الهاتف</label>
              <input
                v-model="form.phone"
                type="text"
                placeholder="010xxxxxxxx"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold mb-1">نوع الصلاحية والترخيص *</label>
              <select
                v-model="form.role"
                :disabled="form.username === 'admin'"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option v-if="appStore.isSuperAdmin" value="super_admin">
                  سوبر أدمن (مالك البرنامج بالكامل)
                </option>
                <option v-if="appStore.isSuperAdmin" value="owner">
                  مستخدم مالك البرنامج (نسخة دائمة)
                </option>
                <option v-if="appStore.isSuperAdmin" value="tenant">
                  مستخدم مستأجر البرنامج (اشتراك محدد)
                </option>
                <option value="receptionist">موظف استقبال وخدمة عملاء</option>
                <option value="cashier">كاشير / محاسب مالي</option>
                <option value="storekeeper">أمين مخزن قطع الغيار</option>
              </select>
            </div>
            <div>
              <label class="block font-bold mb-1">حالة الحساب</label>
              <select
                v-model="form.is_active"
                :disabled="form.username === 'admin'"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option :value="1">نشط ومفعل</option>
                <option :value="0">موقوف مؤقتاً</option>
              </select>
            </div>
          </div>

          <!-- Subscription Dates for Tenant Role -->
          <div
            v-if="form.role === 'tenant'"
            class="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <CalendarClock class="w-4 h-4" />
                إعدادات فترة إيجار البرنامج للمستأجر
              </span>
              <div class="flex gap-1">
                <button
                  type="button"
                  @click="setQuickSubscriptionMonths(1)"
                  class="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
                >
                  شهر
                </button>
                <button
                  type="button"
                  @click="setQuickSubscriptionMonths(3)"
                  class="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
                >
                  3 شهور
                </button>
                <button
                  type="button"
                  @click="setQuickSubscriptionMonths(6)"
                  class="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
                >
                  6 شهور
                </button>
                <button
                  type="button"
                  @click="setQuickSubscriptionMonths(12)"
                  class="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold cursor-pointer"
                >
                  سنة
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold mb-1">تاريخ بداية الاشتراك</label>
                <input
                  v-model="form.subscription_start"
                  type="date"
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700"
                />
              </div>
              <div>
                <label class="block font-bold mb-1">تاريخ نهاية الاشتراك *</label>
                <input
                  v-model="form.subscription_end"
                  type="date"
                  required
                  class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700"
                />
              </div>
            </div>
          </div>

          <div>
            <label class="block font-bold mb-1">ملاحظات</label>
            <input
              v-model="form.notes"
              type="text"
              placeholder="ملاحظات إضافية عن الترخيص..."
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              @click="modalOpen = false"
              class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              حفظ المستخدم والترخيص
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
