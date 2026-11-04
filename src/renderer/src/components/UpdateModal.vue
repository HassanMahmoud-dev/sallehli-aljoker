<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { UpdateCheckResult, UpdateProgressPayload } from '@shared/types'
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
  FolderOpen
} from 'lucide-vue-next'

const appStore = useAppStore()

const updateSourceUrl = ref('HassanMahmoud-dev/sallehli-aljoker')
const isChecking = ref(false)
const isDownloading = ref(false)
const isInstallingLocal = ref(false)
const showAdvancedUrl = ref(false)

const checkResult = ref<UpdateCheckResult | null>(null)
const progress = ref<UpdateProgressPayload | null>(null)
const actionMessage = ref('')
const actionError = ref('')

let unsubscribeProgress: (() => void) | null = null

watch(
  () => appStore.updateModalOpen,
  (isOpen) => {
    if (isOpen) {
      updateSourceUrl.value =
        appStore.settings.update_url || 'HassanMahmoud-dev/sallehli-aljoker'
      actionMessage.value = ''
      actionError.value = ''
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

async function handleDownloadAndInstall(): Promise<void> {
  if (!checkResult.value?.downloadUrl) return

  isDownloading.value = true
  actionError.value = ''
  actionMessage.value = ''
  progress.value = {
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    status: 'downloading'
  }

  try {
    const res = await window.api.downloadAndInstallUpdate(checkResult.value.downloadUrl)
    if (res.success) {
      actionMessage.value =
        res.message ||
        'تم تحميل التحديث وحفظ نسخة احتياطية تلقائية، جاري تشغيل معالج التثبيت...'
    } else {
      actionError.value = res.message || 'فشل تحميل التحديث.'
      isDownloading.value = false
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : 'حدث خطأ أثناء تحميل التحديث.'
    isDownloading.value = false
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
  if (window.api.onUpdateProgress) {
    unsubscribeProgress = window.api.onUpdateProgress((payload) => {
      progress.value = payload
      if (payload.status === 'error' && payload.message) {
        actionError.value = payload.message
        isDownloading.value = false
      }
    })
  }
})

onUnmounted(() => {
  if (unsubscribeProgress) {
    unsubscribeProgress()
  }
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
                تحديث برنامج صلحلي
              </h2>
              <span
                class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold text-[11px]"
              >
                الإصدار الحالي: {{ appStore.appVersion }}
              </span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              التحديث المباشر عبر الإنترنت (GitHub Releases) أو التحديث اليدوي من ملف محلي
            </p>
          </div>
        </div>

        <button
          type="button"
          @click="appStore.closeUpdateModal"
          :disabled="isDownloading"
          class="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
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

        <!-- Status / Error Messages -->
        <div
          v-if="actionMessage"
          class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-bold flex items-center gap-2"
        >
          <CheckCircle2 class="w-5 h-5 text-blue-600 shrink-0" />
          <span>{{ actionMessage }}</span>
        </div>

        <div
          v-if="actionError"
          class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-bold flex items-center gap-2"
        >
          <AlertCircle class="w-5 h-5 text-rose-600 shrink-0" />
          <span>{{ actionError }}</span>
        </div>

        <!-- Option 1: Online Update via GitHub Releases / Server -->
        <div
          class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-4"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <Globe class="w-4 h-4 text-blue-600" />
              <h3 class="font-black text-sm text-slate-900 dark:text-white">
                1. التحديث التلقائي عبر الإنترنت (Online Update)
              </h3>
            </div>
            <button
              type="button"
              @click="showAdvancedUrl = !showAdvancedUrl"
              class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {{ showAdvancedUrl ? 'إخفاء إعدادات المصدر' : 'تغيير مستودع GitHub / الرابط' }}
            </button>
          </div>

          <div v-if="showAdvancedUrl" class="space-y-1.5 pt-1">
            <label class="block font-bold text-slate-700 dark:text-slate-300">
              مستودع GitHub أو رابط خادم التحديثات:
            </label>
            <input
              v-model="updateSourceUrl"
              type="text"
              dir="ltr"
              placeholder="HassanMahmoud-dev/sallehli-aljoker"
              class="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs"
            />
            <p class="text-[10px] text-slate-400">
              الافتراضي: مستودع المشروع الرسمي على GitHub (`HassanMahmoud-dev/sallehli-aljoker`)
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="handleCheckForUpdates"
              :disabled="isChecking || isDownloading"
              class="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition cursor-pointer"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isChecking }" />
              <span>{{
                isChecking ? 'جاري الاتصال والتحقق من وجود تحديثات...' : 'التحقق من وجود تحديثات الآن'
              }}</span>
            </button>
          </div>

          <!-- Check Result Box -->
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

            <div
              v-if="checkResult.releaseNotes"
              class="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 whitespace-pre-wrap leading-relaxed text-[11px] max-h-36 overflow-y-auto"
            >
              <div class="font-black text-slate-700 dark:text-slate-300 mb-1">
                ما الجديد في هذا الإصدار:
              </div>
              {{ checkResult.releaseNotes }}
            </div>

            <!-- Download Progress Bar -->
            <div v-if="isDownloading && progress" class="space-y-1.5 pt-1">
              <div class="flex items-center justify-between font-bold text-[11px]">
                <span>جاري تحميل التحديث...</span>
                <span class="font-mono">
                  {{ progress.percent }}% ({{ formatMegabytes(progress.transferredBytes) }}
                  <template v-if="progress.totalBytes > 0">
                    / {{ formatMegabytes(progress.totalBytes) }}
                  </template>
                  )
                </span>
              </div>
              <div class="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  class="h-full bg-gradient-to-l from-blue-600 to-indigo-600 transition-all duration-200 rounded-full"
                  :style="{ width: `${progress.percent}%` }"
                ></div>
              </div>
            </div>

            <!-- Download & Install Button -->
            <button
              v-if="checkResult.updateAvailable && checkResult.downloadUrl"
              type="button"
              @click="handleDownloadAndInstall"
              :disabled="isDownloading"
              class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <Download class="w-4 h-4" />
              <span>{{
                isDownloading
                  ? 'جاري تحميل التحديث وتجهيز النسخة الاحتياطية...'
                  : `تحميل وتثبيت الإصدار الجديد (v${checkResult.latestVersion}) الآن`
              }}</span>
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
          :disabled="isDownloading"
          class="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
        >
          إغلاق
        </button>
      </div>
    </div>
  </div>
</template>
