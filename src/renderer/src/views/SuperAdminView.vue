<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import type { User, UserRole } from '@shared/types'
import { USER_ROLE_LABELS } from '@renderer/constants/appliances'
import { useAppStore } from '@renderer/stores/appStore'
import {
  ShieldCheck,
  UserPlus,
  Edit3,
  Trash2,
  
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
  notes: string
}>({
  username: '',
  password: '',
  full_name: '',
  phone: '',
  role: 'owner',
  is_active: 1,
  notes: ''
})

async function loadUsers(): Promise<void> {
  users.value = await window.api.listUsers()
}

function openCreateModal(): void {
  errorMsg.value = ''
  form.value = {
    username: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'owner',
    is_active: 1,
    notes: ''
  }
  modalOpen.value = true
}

function openEditModal(u: User): void {
  errorMsg.value = ''
  if (!appStore.isSuperAdmin && ['super_admin', 'owner'].includes(u.role)) {
    swalError('غير مصرح', 'لا يمكن تعديل حسابات الإدارة إلا من خلال السوبر أدمن.')
    return
  }
  form.value = {
    id: u.id,
    username: u.username,
    password: '',
    full_name: u.full_name,
    phone: u.phone || '',
    role: u.role,
    is_active: u.is_active,
    notes: u.notes || ''
  }
  modalOpen.value = true
}



async function handleSaveUser(): Promise<void> {
  errorMsg.value = ''
  if (!form.value.username.trim() || !form.value.full_name.trim()) {
    errorMsg.value = 'يرجى إدخال اسم المستخدم والاسم الكامل'
    swalError('بيانات غير مكتملة', errorMsg.value)
    return
  }
  if (!form.value.id && !form.value.password.trim()) {
    errorMsg.value = 'يرجى تحديد كلمة مرور للمستخدم الجديد'
    swalError('بيانات غير مكتملة', errorMsg.value)
    return
  }
  

  try {
    const isEdit = Boolean(form.value.id)
    const editedUsername = form.value.username.trim()
    const editedPassword = form.value.password.trim()
    await appStore.withLoading(async () => {
      await window.api.saveUser({
        ...form.value
      })
      if (editedUsername === 'admin' && editedPassword) {
        if (editedPassword !== '8520') {
          appStore.clearDefaultPasswordWarning()
        } else {
          appStore.usingDefaultAdminPassword = true
          appStore.defaultPasswordBannerDismissed = false
        }
      }
      modalOpen.value = false
      successMsg.value = 'تم حفظ بيانات المستخدم والصلاحية بنجاح'
      await loadUsers()
    }, isEdit ? 'جاري حفظ تعديلات المستخدم...' : 'جاري إنشاء المستخدم والترخيص...')
    swalSuccess(isEdit ? 'تم حفظ تعديلات المستخدم والترخيص بنجاح' : 'تم إنشاء حساب المستخدم والترخيص بنجاح')
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'تعذر حفظ المستخدم (ربما اسم المستخدم مكرر)'
    swalError('تعذر حفظ المستخدم', errorMsg.value)
  }
}

async function handleDeleteUser(user: User): Promise<void> {
  if (!appStore.isSuperAdmin) {
    swalError('غير مصرح', 'حذف المستخدمين متاح فقط لحساب السوبر أدمن.')
    return
  }
  if (user.username === 'admin') return
  const confirmed = await swalConfirm(
    `حذف المستخدم (${user.full_name})؟`,
    'هل أنت متأكد من حذف هذا الحساب نهائياً؟'
  )
  if (!confirmed) return
  try {
    await appStore.withLoading(async () => {
      await window.api.deleteUser(user.id)
      await loadUsers()
    }, 'جاري حذف حساب المستخدم...')
    swalSuccess('تم حذف حساب المستخدم بنجاح')
  } catch (err: unknown) {
    swalError('فشل الحذف', err instanceof Error ? err.message : '')
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
            لوحة تحكم السوبر أدمن (إدارة المستخدمين والصلاحيات)
          </h1>
          <p class="text-xs text-purple-200 mt-1">
            إدارة حسابات مالكي البرنامج (صلاحية كاملة) والسوبر أدمن
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <router-link
          v-if="appStore.isSuperAdmin"
          to="/program-settings?tab=system"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 border border-purple-400/40 text-white font-black text-xs transition"
        >
          <span>إعدادات الشبكة والمتصفح والويندوز</span>
        </router-link>

        <button
          type="button"
          @click="openCreateModal"
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-950 hover:bg-purple-50 font-black text-xs shadow-md transition cursor-pointer"
        >
          <UserPlus class="w-4 h-4" />
          إضافة مستخدم جديد
        </button>
      </div>
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
              <th class="py-3.5 px-4">نوع الصلاحية</th>
              <th class="py-3.5 px-4">الحالة</th>
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
            <span>{{ form.id ? 'تعديل حساب وصلاحية مستخدم' : 'إنشاء مستخدم جديد' }}</span>
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
              <label class="block font-bold mb-1">نوع الصلاحية *</label>
              <select
                v-model="form.role"
                :disabled="form.username === 'admin'"
                class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
              >
                <option value="owner">
                  مالك البرنامج (صلاحية كاملة)
                </option>
                <option v-if="appStore.isSuperAdmin" value="super_admin">
                  سوبر أدمن (مالك النظام بالكامل)
                </option>
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

          <div>
            <label class="block font-bold mb-1">ملاحظات</label>
            <input
              v-model="form.notes"
              type="text"
              placeholder="ملاحظات إضافية..."
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
              حفظ بيانات المستخدم
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
