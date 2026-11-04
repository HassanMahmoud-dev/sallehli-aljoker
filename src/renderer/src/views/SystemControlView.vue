<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { SystemControlStatus } from '@shared/types'
import {
  Globe,
  Wifi,
  WifiOff,
  MonitorPlay,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Server,
  Smartphone,
  Laptop
} from 'lucide-vue-next'

const appStore = useAppStore()

const status = ref<SystemControlStatus>({
  lanEnabled: true,
  lanRunning: false,
  lanPort: 4545,
  ips: [],
  urls: [],
  localUrl: 'http://localhost:4545',
  autoStartWindows: false
})

const portInput = ref<number>(4545)
const statusMessage = ref('')
const copiedUrl = ref('')

async function loadStatus(): Promise<void> {
  const res = await window.api.getSystemStatus()
  status.value = res
  portInput.value = res.lanPort
  appStore.systemStatus = res
}

function showMessage(msg: string): void {
  statusMessage.value = msg
  setTimeout(() => {
    statusMessage.value = ''
  }, 4000)
}

async function handleToggleLan(enabled: boolean): Promise<void> {
  await appStore.withLoading(async () => {
    const res = await window.api.setLanConfig({
      enabled,
      port: portInput.value || 4545
    })
    status.value = res
    portInput.value = res.lanPort
    appStore.systemStatus = res
    showMessage(
      enabled
        ? `تم تفعيل خادم المتصفح والشبكة المحلية بنجاح على المنفذ ${res.lanPort}`
        : 'تم إيقاف تشغيل البرنامج على المتصفح والشبكة المحلية'
    )
  }, enabled ? 'جاري تشغيل خادم الشبكة المحلية...' : 'جاري إيقاف خادم الشبكة المحلية...')
}

async function handleSavePort(): Promise<void> {
  const cleanPort = Math.max(1024, Math.min(65535, Number(portInput.value || 4545)))
  portInput.value = cleanPort
  await appStore.withLoading(async () => {
    const res = await window.api.setLanConfig({
      enabled: status.value.lanEnabled,
      port: cleanPort
    })
    status.value = res
    appStore.systemStatus = res
    showMessage(`تم تحديث منفذ الشبكة المحلية إلى ${res.lanPort}`)
  }, 'جاري تحديث منفذ الشبكة وإعادة تشغيل الخادم...')
}

async function handleToggleAutoStart(enabled: boolean): Promise<void> {
  await appStore.withLoading(async () => {
    const res = await window.api.setAutoStartWindows(enabled)
    status.value = res
    appStore.systemStatus = res
    showMessage(
      enabled
        ? 'تم تفعيل تشغيل البرنامج تلقائياً مع بداية تشغيل الويندوز'
        : 'تم إلغاء التشغيل التلقائي مع بداية تشغيل الويندوز'
    )
  }, 'جاري تحديث إعدادات بدء تشغيل الويندوز...')
}

async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
    copiedUrl.value = url
    setTimeout(() => {
      if (copiedUrl.value === url) copiedUrl.value = ''
    }, 2000)
  } catch {
    // Ignore
  }
}

function openUrlInBrowser(url: string): void {
  window.api.openExternal(url)
}

onMounted(loadStatus)
</script>

<template>
  <div class="space-y-6 max-w-5xl">
    <!-- Top Super Admin Banner -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-l from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg"
    >
      <div class="flex items-center gap-3.5">
        <div class="p-3 rounded-2xl bg-white/10 border border-white/20">
          <Server class="w-8 h-8 text-purple-300" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-black">
              التحكم بالشبكة المحلية (LAN) والمتصفح وإقلاع الويندوز
            </h1>
            <span
              class="px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-400/40 text-purple-100 text-[11px] font-bold"
            >
              صلاحية سوبر أدمن فقط
            </span>
          </div>
          <p class="text-xs text-purple-200 mt-1">
            تحكم حصري للسوبر أدمن في السماح بفتح البرنامج على المتصفح وعبر أجهزة الشبكة المحلية (IP) وتشغيله تلقائياً مع الويندوز
          </p>
        </div>
      </div>

      <button
        type="button"
        @click="loadStatus"
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition cursor-pointer"
      >
        <RefreshCw class="w-4 h-4" />
        تحديث حالة الشبكة والـ IP
      </button>
    </div>

    <!-- Status Notification -->
    <div
      v-if="statusMessage"
      class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2"
    >
      <ShieldCheck class="w-5 h-5 text-emerald-600 shrink-0" />
      <span>{{ statusMessage }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
      <!-- Left/Main 2 Columns: Browser & LAN Control -->
      <div
        class="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div class="flex items-center gap-2.5">
            <div
              :class="[
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                status.lanEnabled && status.lanRunning
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              ]"
            >
              <Wifi v-if="status.lanEnabled && status.lanRunning" class="w-5 h-5" />
              <WifiOff v-else class="w-5 h-5" />
            </div>
            <div>
              <h2 class="text-sm font-black text-slate-900 dark:text-white">
                تشغيل البرنامج على المتصفح وداخل الشبكة المحلية (LAN)
              </h2>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">
                يتيح فتح البرنامج على متصفح الإنترنت أو من أي كمبيوتر أو هاتف متصل بنفس الشبكة (Wi-Fi / LAN)
              </p>
            </div>
          </div>

          <!-- Toggle Switch -->
          <button
            type="button"
            @click="handleToggleLan(!status.lanEnabled)"
            :class="[
              'px-4 py-2 rounded-xl font-black text-xs transition flex items-center gap-2 cursor-pointer shadow-xs',
              status.lanEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            ]"
          >
            <span
              :class="[
                'w-2.5 h-2.5 rounded-full',
                status.lanEnabled ? 'bg-white animate-pulse' : 'bg-slate-400'
              ]"
            ></span>
            <span>{{ status.lanEnabled ? 'مفعل (يعمل على المتصفح والشبكة)' : 'متوقف (معطل)' }}</span>
          </button>
        </div>

        <!-- Port Setting -->
        <div
          class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-end justify-between gap-4"
        >
          <div class="space-y-1 flex-1 min-w-[200px]">
            <label class="block font-bold text-slate-700 dark:text-slate-300">
              منفذ الاتصال المحلي (Port Number)
            </label>
            <p class="text-[11px] text-slate-500">
              المنفذ الافتراضي هو <span class="font-mono font-bold">4545</span>. يُستخدم في نهاية رابط الـ IP.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model.number="portInput"
              type="number"
              min="1024"
              max="65535"
              dir="ltr"
              class="w-28 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-center text-sm"
            />
            <button
              type="button"
              @click="handleSavePort"
              class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
            >
              تغيير المنفذ
            </button>
          </div>
        </div>

        <!-- Links Box when Enabled -->
        <div v-if="status.lanEnabled && status.lanRunning" class="space-y-4">
          <!-- Local Machine Browser Link -->
          <div
            class="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-2.5"
          >
            <div class="flex items-center justify-between">
              <span class="font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                <Laptop class="w-4 h-4 text-blue-600" />
                الفتح على متصفح هذا الجهاز (Localhost):
              </span>
              <span class="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                نفس الكمبيوتر
              </span>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-blue-200/70 dark:border-slate-800">
              <span dir="ltr" class="font-mono font-black text-sm text-blue-600 dark:text-blue-400 select-all">
                {{ status.localUrl }}
              </span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  @click="copyLink(status.localUrl)"
                  class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check v-if="copiedUrl === status.localUrl" class="w-3.5 h-3.5 text-emerald-600" />
                  <Copy v-else class="w-3.5 h-3.5" />
                  <span>{{ copiedUrl === status.localUrl ? 'تم النسخ' : 'نسخ الرابط' }}</span>
                </button>
                <button
                  type="button"
                  @click="openUrlInBrowser(status.localUrl)"
                  class="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink class="w-3.5 h-3.5" />
                  <span>فتح على المتصفح الآن</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Network IP Links for Other Devices on LAN -->
          <div
            class="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-3"
          >
            <div class="flex items-center justify-between">
              <span class="font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Smartphone class="w-4 h-4 text-emerald-600" />
                روابط الشبكة المحلية (للدخول من الأجهزة الأخرى عبر IP الجهاز):
              </span>
              <span class="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                شبكة Wi-Fi / LAN
              </span>
            </div>

            <div v-if="status.urls.length > 0" class="space-y-2">
              <div
                v-for="url in status.urls"
                :key="url"
                class="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-200/70 dark:border-slate-800"
              >
                <span dir="ltr" class="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 select-all">
                  {{ url }}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    @click="copyLink(url)"
                    class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check v-if="copiedUrl === url" class="w-3.5 h-3.5 text-emerald-600" />
                    <Copy v-else class="w-3.5 h-3.5" />
                    <span>{{ copiedUrl === url ? 'تم النسخ' : 'نسخ الرابط' }}</span>
                  </button>
                  <button
                    type="button"
                    @click="openUrlInBrowser(url)"
                    class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Globe class="w-3.5 h-3.5" />
                    <span>فتح في المتصفح</span>
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="p-3 rounded-xl bg-white dark:bg-slate-900 text-amber-600 font-bold">
              لم يتم اكتشاف اتصال بشبكة محلية (Wi-Fi / Ethernet) حالياً. تأكد من اتصال الجهاز بالراوتر ثم اضغط "تحديث حالة الشبكة".
            </div>

            <p class="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
              💡 <strong>طريقة الاستخدام:</strong> افتح أي متصفح (Chrome / Edge / Safari) على أي جهاز كمبيوتر آخر أو موبايل متصل بنفس الراوتر، واكتب الرابط أعلاه في شريط العنوان ليفتح معك البرنامج مباشرة وبنفس قاعدة البيانات اللحظية.
            </p>
          </div>
        </div>

        <!-- Disabled Notice -->
        <div
          v-else
          class="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center space-y-2"
        >
          <WifiOff class="w-8 h-8 text-slate-400 mx-auto" />
          <div class="font-black text-sm text-slate-700 dark:text-slate-200">
            التشغيل عبر المتصفح والشبكة المحلية معطل حالياً من قِبل السوبر أدمن
          </div>
          <p class="text-xs text-slate-500">
            اضغط على زر التفعيل أعلاه للسماح بفتح البرنامج على المتصفح أو عبر الـ IP داخل الشبكة المحلية.
          </p>
        </div>
      </div>

      <!-- Right Column: Windows Startup Control -->
      <div class="space-y-6">
        <div
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4"
        >
          <div class="flex items-center gap-3">
            <div
              :class="[
                'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
                status.autoStartWindows
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              ]"
            >
              <MonitorPlay class="w-6 h-6" />
            </div>
            <div>
              <h3 class="font-black text-sm text-slate-900 dark:text-white">
                التشغيل مع بداية الويندوز
              </h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">
                فتح البرنامج تلقائياً عند إقلاع النظام
              </p>
            </div>
          </div>

          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            عند تفعيل هذا الخيار، سيقوم نظام Windows بتشغيل برنامج <strong>صلحلي</strong> تلقائياً فور فتح جهاز الكمبيوتر، مما يضمن جاهزية النظام وخادم الشبكة المحلية دائماً بدون الحاجة لفتحه يدوياً.
          </p>

          <div
            class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
          >
            <span class="font-bold text-slate-800 dark:text-slate-200">
              الحالة الحالية:
            </span>
            <span
              :class="[
                'px-2.5 py-1 rounded-full text-[11px] font-black',
                status.autoStartWindows
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
              ]"
            >
              {{ status.autoStartWindows ? 'مفعل مع بدء الويندوز' : 'غير مفعل (يدوي)' }}
            </span>
          </div>

          <button
            type="button"
            @click="handleToggleAutoStart(!status.autoStartWindows)"
            :class="[
              'w-full py-3 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm',
              status.autoStartWindows
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            ]"
          >
            <MonitorPlay class="w-4 h-4" />
            <span>
              {{
                status.autoStartWindows
                  ? 'إيقاف التشغيل التلقائي مع الويندوز'
                  : 'تفعيل التشغيل التلقائي مع بداية الويندوز'
              }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
