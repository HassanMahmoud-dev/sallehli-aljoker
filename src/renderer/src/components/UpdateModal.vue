<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import { filterReleaseNotes } from '@shared/releaseNotesFilter'
import { swalConfirm } from '@renderer/utils/swal'
import type { UpdateCheckResult } from '@shared/types'
import {
  RefreshCw,
  Download,
  HardDriveUpload,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  Globe,
  Sparkles,
  FolderOpen,
  Pause,
  Play,
  Minimize2
} from 'lucide-vue-next'

const appStore = useAppStore()

const updateSourceUrl = ref('HassanMahmoud-dev/sallehli-aljoker')
const isChecking = ref(false)
const isInstallingLocal = ref(false)
const isApplyingUpdate = ref(false)
const showAdvancedUrl = ref(false)
const showAllNotes = ref(false)

const checkResult = ref<UpdateCheckResult | null>(null)
const actionMessage = ref('')
const actionError = ref('')

const isDownloading = computed(() => appStore.updateDownloadState.isDownloading)
const isPaused = computed(() => appStore.updateDownloadState.isPaused)
const isReadyToInstall = computed(() => appStore.updateDownloadState.isReadyToInstall)
const progress = computed(() => appStore.updateDownloadState.progress)

const displayedReleaseNotes = computed(() => {
  const raw = checkResult.value?.releaseNotes || ''
  if (!raw) return ''
  if (showAllNotes.value) return raw
  return filterReleaseNotes(raw, appStore.businessType)
})

watch(
  () => appStore.updateModalOpen,
  (isOpen) => {
    if (isOpen) {
      updateSourceUrl.value =
        appStore.settings.update_url || 'HassanMahmoud-dev/sallehli-aljoker'
      actionMessage.value = ''
      actionError.value = ''
      appStore.syncUpdateDownloadStatus()
      if (appStore.availableUpdate && !checkResult.value) {
        checkResult.value = appStore.availableUpdate
      }
    }
  }
)

function formatMegabytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return 'جاري الحساب...'
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`
  }
  return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`
}

function formatRemainingTime(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds < 0) return 'جاري التقدير...'
  if (seconds <= 1) return 'أقل من ثانية'
  if (seconds < 60) return `${seconds} ثانية`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins} دقيقة و ${secs} ثانية` : `${mins} دقيقة`
}

async function handleCheckForUpdates(): Promise<void> {
  isChecking.value = true
  checkResult.value = null
  actionMessage.value = ''
  actionError.value = ''

  try {
    const res = await window.api.checkForUpdates(updateSourceUrl.value)
    checkResult.value = res
    appStore.setAvailableUpdate(res.updateAvailable ? res : null)
    if (updateSourceUrl.value.trim() !== appStore.settings.update_url) {
      await appStore.loadSettings()
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'تعذر التحقق من التحديثات.'
  } finally {
    isChecking.value = false
  }
}

async function handleStartDownload(): Promise<void> {
  if (!checkResult.value?.downloadUrl) return

  actionError.value = ''
  actionMessage.value = ''

  try {
    const res = await window.api.startUpdateDownload(
      checkResult.value.downloadUrl,
      checkResult.value.latestVersion
    )
    if (!res.success) {
      actionError.value = res.message || 'فشل بدء تحميل التحديث.'
    } else {
      actionMessage.value = res.message || 'جاري تحميل التحديث في الخلفية...'
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'حدث خطأ أثناء بدء تحميل التحديث.'
  }
}

async function handlePauseDownload(): Promise<void> {
  try {
    const res = await window.api.pauseUpdateDownload()
    actionMessage.value = res.message || 'تم إيقاف التحميل مؤقتاً.'
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'فشل إيقاف التحميل مؤقتاً.'
  }
}

async function handleCancelDownload(): Promise<void> {
  const confirmed = await swalConfirm(
    'إلغاء تحميل التحديث',
    'هل أنت متأكد من رغبتك في إلغاء تحميل التحديث وحذف الملف المؤقت؟',
    'نعم، إلغاء التحميل'
  )
  if (!confirmed) return

  try {
    const res = await window.api.cancelUpdateDownload()
    actionError.value = ''
    actionMessage.value = res.message || 'تم إلغاء تحميل التحديث بنجاح.'
  } catch {
    // Ignore
  }
}

async function handleApplyDownloadedUpdate(): Promise<void> {
  const confirmed = await swalConfirm(
    'تثبيت التحديث الآن',
    'سيتم أخذ نسخة احتياطية تلقائية من قاعدة البيانات وإغلاق البرنامج لتطبيق التحديث الجديد. هل أنت مستعد للبدء الآن؟',
    'تثبيت التحديث وإعادة التشغيل'
  )
  if (!confirmed) return

  isApplyingUpdate.value = true
  actionError.value = ''
  actionMessage.value = 'جاري حفظ نسخة احتياطية وتشغيل معالج التثبيت...'

  try {
    const res = await window.api.applyDownloadedUpdate()
    if (!res.success) {
      actionError.value = res.message || 'تعذر تشغيل ملف التثبيت.'
      isApplyingUpdate.value = false
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'فشل تطبيق التحديث.'
    isApplyingUpdate.value = false
  }
}

async function handleInstallFromLocalFile(): Promise<void> {
  isInstallingLocal.value = true
  actionError.value = ''
  actionMessage.value = ''

  try {
    const res = await window.api.installLocalUpdate()
    if (res.canceled) {
      isInstallingLocal.value = false
      return
    }
    if (res.success) {
      actionMessage.value =
        res.message ||
        'تم حفظ نسخة احتياطية تلقائية لقاعدة البيانات، وجاري فتح معالج التحديث الآن...'
    } else {
      actionError.value = res.message || 'تعذر تشغيل ملف التحديث.'
      isInstallingLocal.value = false
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'حدث خطأ أثناء فتح ملف التحديث.'
    isInstallingLocal.value = false
  }
}

onMounted(() => {
  appStore.syncUpdateDownloadStatus()
})
</script>

<template>
  <div
    v-if="appStore.updateModalOpen"
    class="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
  >
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs"
    >
      <!-- Modal Header -->
      <div
        class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-l from-blue-600/10 via-indigo-600/5 to-transparent"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25 shrink-0"
          >
            <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': isChecking || isDownloading }" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-black text-slate-900 dark:text-white">
                تحديث برنامج {{ appStore.appName }}
              </h2>
              <span
                class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold text-[11px]"
              >
                الإصدار الحالي: {{ appStore.appVersion }}
              </span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              التحديث المباشر عبر الإنترنت مع إمكانية التحميل بالخلفية وإيقاف/استئناف التحميل
            </p>
          </div>
        </div>

        <button
          type="button"
          @click="appStore.closeUpdateModal"
          class="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="إغلاق النافذة ومتابعة العمل"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
        <!-- Safety Reassurance Banner -->
        <div
          class="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 flex items-start gap-3"
        >
          <ShieldCheck class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div class="leading-relaxed text-emerald-900 dark:text-emerald-200">
            <span class="font-black">حماية كاملة للبيانات (100%):</span>
            عند التحديث لن يتم مسح أي بيانات أو فواتير، كما يقوم البرنامج تلقائياً بأخذ
            <span class="font-bold underline">نسخة احتياطية إضافية</span> من قاعدة البيانات قبل بدء
            التثبيت.
          </div>
        </div>

        <!-- Option 1: Online GitHub Releases Update -->
        <div
          class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-4"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Globe class="w-4 h-4 text-blue-600" />
              <h3 class="font-black text-sm text-slate-900 dark:text-white">
                1. التحديث التلقائي عبر الإنترنت (GitHub Releases)
              </h3>
            </div>
            <button
              type="button"
              @click="showAdvancedUrl = !showAdvancedUrl"
              class="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 underline cursor-pointer"
            >
              {{ showAdvancedUrl ? 'إخفاء الإعدادات المتقدمة' : 'إعدادات متقدمة (رابط التحديث)' }}
            </button>
          </div>

          <!-- Advanced URL Input (Collapsed by default) -->
          <div v-if="showAdvancedUrl" class="space-y-1.5 pt-1">
            <label class="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">
              مصدر التحديثات (مستودع GitHub أو رابط مباشر):
            </label>
            <div class="flex gap-2">
              <input
                v-model="updateSourceUrl"
                type="text"
                dir="ltr"
                placeholder="HassanMahmoud-dev/sallehli-aljoker"
                class="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <!-- Check Button -->
          <div class="flex gap-2">
            <button
              type="button"
              @click="handleCheckForUpdates"
              :disabled="isChecking || isDownloading"
              class="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isChecking }" />
              <span>{{ isChecking ? 'جاري التحقق من الخادم...' : 'فحص وجود تحديثات جديدة الآن' }}</span>
            </button>
          </div>

          <!-- Action Status / Errors -->
          <div
            v-if="actionError"
            class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start gap-2"
          >
            <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
            <span class="font-bold">{{ actionError }}</span>
          </div>

          <div
            v-if="actionMessage && !actionError"
            class="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 flex items-start gap-2"
          >
            <CheckCircle2 class="w-4 h-4 shrink-0 mt-0.5" />
            <span class="font-bold">{{ actionMessage }}</span>
          </div>

          <!-- Result Card if check performed -->
          <div
            v-if="checkResult"
            :class="[
              'p-4 rounded-2xl border space-y-3',
              checkResult.updateAvailable
                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
                : checkResult.success
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
            ]"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 font-black text-sm">
                <Sparkles
                  v-if="checkResult.updateAvailable"
                  class="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                />
                <CheckCircle2
                  v-else-if="checkResult.success"
                  class="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                />
                <AlertCircle v-else class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{{ checkResult.message }}</span>
              </div>

              <span
                v-if="checkResult.latestVersion"
                class="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
              >
                v{{ checkResult.latestVersion }}
              </span>
            </div>

            <!-- Release Notes with Activity Filter -->
            <div v-if="checkResult.releaseNotes" class="space-y-1.5">
              <div class="flex items-center justify-between text-[11px]">
                <div class="font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>ما الجديد في هذا الإصدار:</span>
                  <span
                    v-if="!showAllNotes"
                    class="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]"
                  >
                    مخصص لنشاط: {{ appStore.businessProfile.appName }}
                  </span>
                </div>
                <button
                  type="button"
                  @click="showAllNotes = !showAllNotes"
                  class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-bold"
                >
                  {{ showAllNotes ? 'عرض الخاص بنشاطي فقط' : 'عرض كل ملاحظات التحديث' }}
                </button>
              </div>

              <div
                class="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 whitespace-pre-wrap leading-relaxed text-[11px] max-h-36 overflow-y-auto"
              >
                {{ displayedReleaseNotes }}
              </div>
            </div>

            <!-- Download Progress Bar, Speed, ETA & Pause / Cancel Controls -->
            <div
              v-if="(isDownloading || isPaused) && progress"
              class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2.5"
            >
              <div class="flex items-center justify-between font-bold text-[11px]">
                <span
                  :class="isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-700 dark:text-indigo-300'"
                >
                  {{ isPaused ? 'التحميل متوقف مؤقتاً...' : 'جاري تحميل التحديث في الخلفية...' }}
                </span>
                <span class="font-mono text-slate-800 dark:text-slate-200">
                  {{ progress.percent }}% ({{ formatMegabytes(progress.transferredBytes) }}
                  <template v-if="progress.totalBytes > 0">
                    / {{ formatMegabytes(progress.totalBytes) }}
                  </template>
                  )
                </span>
              </div>

              <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  :class="[
                    'h-full rounded-full transition-all duration-200',
                    isPaused
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-l from-blue-600 to-indigo-600'
                  ]"
                  :style="{ width: `${progress.percent}%` }"
                ></div>
              </div>

              <div
                class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300"
              >
                <div class="flex flex-wrap items-center gap-4">
                  <span v-if="!isPaused">
                    🚀 سرعة التحميل:
                    <strong dir="ltr" class="font-mono text-blue-600 dark:text-blue-400">
                      {{ formatSpeed(progress.speedBytesPerSec) }}
                    </strong>
                  </span>
                  <span v-if="!isPaused">
                    ⏳ الوقت المتبقي:
                    <strong class="text-indigo-600 dark:text-indigo-400">
                      {{ formatRemainingTime(progress.remainingSeconds) }}
                    </strong>
                  </span>
                  <span v-else class="text-amber-600 dark:text-amber-400 font-bold">
                    يمكنك استئناف التحميل في أي وقت.
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <!-- Pause / Resume Button -->
                  <button
                    v-if="isDownloading"
                    type="button"
                    @click="handlePauseDownload"
                    class="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-300 font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Pause class="w-3.5 h-3.5" />
                    <span>إيقاف مؤقت</span>
                  </button>

                  <button
                    v-else-if="isPaused"
                    type="button"
                    @click="handleStartDownload"
                    class="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Play class="w-3.5 h-3.5" />
                    <span>استئناف التحميل</span>
                  </button>

                  <!-- Cancel Download Button -->
                  <button
                    type="button"
                    @click="handleCancelDownload"
                    class="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/70 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 font-black flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <X class="w-3.5 h-3.5" />
                    <span>إلغاء</span>
                  </button>
                </div>
              </div>

              <!-- Minimize Reassurance -->
              <div class="pt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                <span>يمكنك إغلاق هذه النافذة ومتابعة عملك بشكل طبيعي؛ التحميل مستمر في الخلفية.</span>
                <button
                  type="button"
                  @click="appStore.closeUpdateModal"
                  class="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Minimize2 class="w-3 h-3" />
                  تصغير ومتابعة العمل
                </button>
              </div>
            </div>

            <!-- Ready To Install Card & Action Button -->
            <div
              v-if="isReadyToInstall"
              class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 space-y-3"
            >
              <div class="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black text-sm">
                <CheckCircle2 class="w-5 h-5 text-emerald-600" />
                <span>تم اكتمال تحميل التحديث بنجاح وهو جاهز للتثبيت!</span>
              </div>
              <p class="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                لن يتم تطبيق التحديث أو إغلاق البرنامج إلا بعد موافقتك. اضغط على الزر أدناه لتطبيق التحديث الآن، أو يمكنك تأجيل التثبيت ومتابعة العمل.
              </p>

              <div class="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  @click="handleApplyDownloadedUpdate"
                  :disabled="isApplyingUpdate"
                  class="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw v-if="isApplyingUpdate" class="w-4 h-4 animate-spin" />
                  <CheckCircle2 v-else class="w-4 h-4" />
                  <span>تثبيت التحديث وإعادة التشغيل الآن</span>
                </button>

                <button
                  type="button"
                  @click="appStore.closeUpdateModal"
                  class="py-3 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition cursor-pointer"
                >
                  تأجيل للاحقاً
                </button>
              </div>
            </div>

            <!-- Start Download Button (Initial State) -->
            <button
              v-else-if="checkResult.updateAvailable && checkResult.downloadUrl && !isDownloading && !isPaused"
              type="button"
              @click="handleStartDownload"
              class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <Download class="w-4 h-4" />
              <span>بدء تحميل الإصدار الجديد (v{{ checkResult.latestVersion }}) في الخلفية</span>
            </button>
          </div>
        </div>

        <!-- Option 2: Offline Local File Update -->
        <div
          class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
        >
          <div class="flex items-center gap-2">
            <HardDriveUpload class="w-4 h-4 text-emerald-600" />
            <h3 class="font-black text-sm text-slate-900 dark:text-white">
              2. التحديث اليدوي من ملف محلي بدون إنترنت (Offline Update)
            </h3>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            إذا كان الجهاز غير متصل بالإنترنت ولديك ملف التحديث الجديد
            <span class="font-mono font-bold">(Sallehli-Setup.exe)</span> على فلاشة USB أو على
            الكمبيوتر، اضغط هنا ليقوم البرنامج بحفظ نسخة احتياطية من قاعدة البيانات وتشغيل التحديث
            مباشرة.
          </p>

          <button
            type="button"
            @click="handleInstallFromLocalFile"
            :disabled="isDownloading || isInstallingLocal"
            class="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <FolderOpen class="w-4 h-4 text-amber-400" />
            <span>اختيار ملف التحديث (.exe) من الكمبيوتر والبدء بالتحديث</span>
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between text-[11px] text-slate-500"
      >
        <span>تطوير ودعم فني: شركة الجوكر تك (Al-Joker Tech)</span>
        <button
          type="button"
          @click="appStore.closeUpdateModal"
          class="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
        >
          {{ isDownloading ? 'متابعة العمل وإغلاق النافذة' : 'إغلاق' }}
        </button>
      </div>
    </div>
  </div>
</template>
