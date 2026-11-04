<script setup lang="ts">
import { plain } from '@renderer/utils/plain'
import { ref, onMounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import jokerTechLogo from '@renderer/assets/joker-tech-logo.png'
import type { CenterSettings } from '@shared/types'
import {
  Settings,
  Save,
  DatabaseBackup,
  Upload,
  Printer,
  CheckCircle2,
  Image as ImageIcon,
  RefreshCw,
  FolderOpen
} from 'lucide-vue-next'

const appStore = useAppStore()
const form = ref<CenterSettings>({ ...appStore.settings })
const dbPath = ref('')
const statusMessage = ref('')

async function loadSettingsData(): Promise<void> {
  await appStore.loadSettings()
  form.value = { ...appStore.settings }
  dbPath.value = await window.api.getDatabasePath()
}

function handleLogoUpload(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    form.value.logo_base64 = String(reader.result || '')
  }
  reader.readAsDataURL(file)
}

async function handleSaveSettings(): Promise<void> {
  await appStore.withLoading(async () => {
    await window.api.saveSettings(plain(form.value))
    await appStore.loadSettings()
    statusMessage.value = 'تم حفظ إعدادات المركز وقوالب الطباعة بنجاح!'
  }, 'جاري حفظ إعدادات المركز...')
  setTimeout(() => {
    statusMessage.value = ''
  }, 4000)
}

async function handleCreateBackup(): Promise<void> {
  const res = await window.api.createBackup()
  if (res.success) {
    statusMessage.value = `تم حفظ النسخة الاحتياطية بنجاح في: ${res.filePath}`
  }
}

async function handleChooseAutoBackupDir(): Promise<void> {
  const res = await window.api.chooseBackupDir()
  if (res.success && res.dirPath) {
    form.value.auto_backup_dir = res.dirPath
    await window.api.saveSettings(plain(form.value))
    await appStore.loadSettings()
    statusMessage.value = `تم تحديث مجلد النسخ الاحتياطي التلقائي إلى: ${res.dirPath}`
  }
}

async function handleRunAutoBackupNow(): Promise<void> {
  await window.api.saveSettings(plain(form.value))
  const res = await window.api.runAutoBackupNow()
  if (res.success) {
    statusMessage.value = `تم أخذ نسخة احتياطية تلقائية فورية في: ${res.filePath}`
  }
}

async function handleRestoreBackup(): Promise<void> {
  if (
    !confirm(
      'تنبيه هام: استعادة نسخة احتياطية ستقوم باستبدال البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟'
    )
  )
    return
  const res = await window.api.restoreBackup()
  if (res.success) {
    await loadSettingsData()
    statusMessage.value = 'تم استعادة قاعدة البيانات بنجاح!'
  }
}

async function handleDirectLocalUpdate(): Promise<void> {
  const res = await window.api.installLocalUpdate()
  if (res.success) {
    statusMessage.value =
      res.message || 'تم حفظ نسخة احتياطية وجاري تشغيل ملف التحديث المحلي الآن...'
  }
}

onMounted(loadSettingsData)
</script>

<template>
  <div class="space-y-6 max-w-5xl">
    <!-- Header -->
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4"
    >
      <div>
        <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Settings class="w-5 h-5 text-blue-600" />
          إعدادات المركز، قوالب الطباعة (A4 / 80mm)، والنسخ الاحتياطي
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          تخصيص اسم وشعار المركز، أرقام التواصل، بنود شهادة الضمان، وإدارة قاعدة البيانات المحلية
        </p>
      </div>

      <button
        type="button"
        @click="handleSaveSettings"
        class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer"
      >
        <Save class="w-4 h-4" />
        حفظ كافة الإعدادات
      </button>
    </div>

    <div
      v-if="statusMessage"
      class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2"
    >
      <CheckCircle2 class="w-5 h-5 text-emerald-600" />
      <span>{{ statusMessage }}</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
      <!-- Center Info & Print Settings (2 cols) -->
      <div
        class="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <h3 class="font-black text-sm text-slate-900 dark:text-white border-b pb-2">
          🏢 البيانات الأساسية لمركز الصيانة (تظهر في الفواتير وشهادات الضمان)
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold mb-1">اسم مركز الصيانة *</label>
            <input
              v-model="form.center_name"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">الوصف المختصر تحت الاسم</label>
            <input
              v-model="form.center_subtitle"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block font-bold mb-1">رقم خدمة العملاء 1</label>
            <input
              v-model="form.phone1"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">رقم خدمة العملاء 2</label>
            <input
              v-model="form.phone2"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">رقم واتساب المركز</label>
            <input
              v-model="form.whatsapp"
              type="text"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono"
            />
          </div>
        </div>

        <div>
          <label class="block font-bold mb-1">عنوان المركز بالتفصيل</label>
          <input
            v-model="form.address"
            type="text"
            class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div>
            <label class="block font-bold mb-1 flex items-center gap-1">
              <Printer class="w-3.5 h-3.5 text-blue-600" />
              قالب الطباعة الافتراضي
            </label>
            <select
              v-model="form.default_print_format"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            >
              <option value="a4">قالب ورق A4 / A5 الرسمي</option>
              <option value="thermal80">قالب طابعة إيصالات حرارية 80mm</option>
            </select>
          </div>
          <div>
            <label class="block font-bold mb-1">رسوم الكشف الافتراضية (ج.م)</label>
            <input
              v-model.number="form.default_inspection_fee"
              type="number"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
          <div>
            <label class="block font-bold mb-1">مدة الضمان الافتراضية (بالشهور)</label>
            <input
              v-model.number="form.default_warranty_months"
              type="number"
              class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
            />
          </div>
        </div>

        <div>
          <label class="block font-bold mb-1">بنود وشروط شهادة الضمان المطبوعة</label>
          <textarea
            v-model="form.warranty_terms"
            rows="4"
            class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 leading-relaxed"
          ></textarea>
        </div>

        <div>
          <label class="block font-bold mb-1">تذييل الفاتورة والإيصال (Footer)</label>
          <input
            v-model="form.receipt_footer"
            type="text"
            class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
          />
        </div>
      </div>

      <!-- Right Column: Logo & Database Backup -->
      <div class="space-y-6">
        <!-- Logo Box -->
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-black text-sm flex items-center gap-2">
            <ImageIcon class="w-4 h-4 text-blue-600" />
            شعار المركز (Logo)
          </h3>

          <div
            class="h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800/40 overflow-hidden"
          >
            <img
              v-if="form.logo_base64"
              :src="form.logo_base64"
              alt="Logo"
              class="max-h-28 object-contain"
            />
            <span v-else class="text-slate-400">لا يوجد شعار مرفوع حالياً</span>
          </div>

          <div class="flex gap-2">
            <label
              class="flex-1 text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold cursor-pointer"
            >
              اختيار صورة شعار
              <input type="file" accept="image/*" @change="handleLogoUpload" class="hidden" />
            </label>
            <button
              v-if="form.logo_base64"
              type="button"
              @click="form.logo_base64 = ''"
              class="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 font-bold cursor-pointer"
            >
              حذف
            </button>
          </div>
        </div>

        <!-- Database Backup & Restore Box -->
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <h3 class="font-black text-sm flex items-center gap-2">
            <DatabaseBackup class="w-4 h-4 text-emerald-600" />
            النسخ الاحتياطي لقاعدة البيانات (SQLite)
          </h3>
          <p class="text-[11px] text-slate-500 leading-relaxed">
            احفظ نسخة احتياطية من جميع بيانات العملاء، الفواتير، المخزن، والخزينة على فلاشة خارجية أو قرص آخر لضمان الأمان التام.
          </p>

          <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-[10px] break-all">
            مسار قاعدة البيانات: {{ dbPath }}
          </div>

          <button
            type="button"
            @click="handleCreateBackup"
            class="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <DatabaseBackup class="w-4 h-4" />
            حفظ نسخة احتياطية الآن
          </button>

          <button
            type="button"
            @click="handleRestoreBackup"
            class="w-full py-2.5 px-4 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Upload class="w-4 h-4" />
            استعادة نسخة احتياطية سابقة
          </button>

          <!-- Automatic Backup Settings -->
          <div
            class="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            <div class="flex items-center justify-between">
              <label for="autoBackupToggle" class="font-black text-slate-900 dark:text-white">
                تفعيل النسخ الاحتياطي التلقائي عند إغلاق البرنامج
              </label>
              <input
                id="autoBackupToggle"
                type="checkbox"
                :checked="Boolean(form.auto_backup_enabled)"
                @change="
                  (e) => (form.auto_backup_enabled = (e.target as HTMLInputElement).checked ? 1 : 0)
                "
                class="w-4 h-4 cursor-pointer"
              />
            </div>

            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1">
                مجلد حفظ النسخ التلقائية (يحتفظ بآخر {{ form.auto_backup_keep_count || 10 }} نسخ)
              </label>
              <div class="flex items-center gap-1.5">
                <input
                  v-model="form.auto_backup_dir"
                  type="text"
                  readonly
                  class="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]"
                />
                <button
                  type="button"
                  @click="handleChooseAutoBackupDir"
                  class="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 font-bold cursor-pointer shrink-0"
                >
                  تغيير المجلد
                </button>
              </div>
            </div>

            <button
              type="button"
              @click="handleRunAutoBackupNow"
              class="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold cursor-pointer"
            >
              أخذ نسخة احتياطية تلقائية فورية الآن
            </button>
          </div>
        </div>

        <!-- Program Version, Updates & Developer Info Box -->
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3"
        >
          <div class="flex items-center justify-between">
            <span class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
              <RefreshCw class="w-4 h-4 text-blue-600" />
              تحديث البرنامج والإصدار
            </span>
            <span
              class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold text-xs"
            >
              {{ appStore.appVersion }}
            </span>
          </div>

          <p class="text-[11px] text-slate-500 leading-relaxed">
            يمكنك فحص التحديثات المباشرة عبر الإنترنت (GitHub Releases) أو التحديث من ملف محلي (.exe) مع أخذ نسخة احتياطية تلقائية لبياناتك.
          </p>

          <button
            type="button"
            @click="appStore.openUpdateModal"
            class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw class="w-4 h-4" />
            فحص التحديثات عبر الإنترنت / إدارة التحديث
          </button>

          <button
            type="button"
            @click="handleDirectLocalUpdate"
            class="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <FolderOpen class="w-4 h-4 text-amber-500" />
            تحديث سريع من ملف محلي (.exe)
          </button>

          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <img
              :src="jokerTechLogo"
              alt="شركة الجوكر تك"
              class="w-11 h-11 object-contain bg-white rounded-xl p-1.5 border border-slate-200 shrink-0"
            />
            <div>
              <div class="font-black text-xs text-slate-900 dark:text-white">
                تطوير: الجوكر تك (Al-Joker Tech)
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                برنامج صلحلي — نظام إدارة مراكز صيانة الأجهزة الكهربائية والمنزلية.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
