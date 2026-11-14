<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@renderer/stores/appStore'
import { swalSuccess, swalError, swalConfirm } from '@renderer/utils/swal'
import type { BusinessType } from '@shared/types'
import { BUSINESS_PROFILES } from '@shared/businessProfiles'
import { Sparkles, Wrench, Ear, CheckCircle2 } from 'lucide-vue-next'

const appStore = useAppStore()
const selectedType = ref<BusinessType>(appStore.businessType || 'appliances')
const isSaving = ref(false)

watch(
  () => appStore.businessType,
  (nextType) => {
    if (appStore.needsBusinessSetup && nextType) {
      selectedType.value = nextType
    }
  }
)

async function handleConfirmSetup(): Promise<void> {
  const profile = BUSINESS_PROFILES[selectedType.value]
  const confirmed = await swalConfirm(
    `تأكيد اعتماد نشاط (${profile.appName})`,
    `سيتم تهيئة البرنامج للعمل كـ "${profile.windowTitle}". يمكنك البدء فوراً بعد التأكيد.`
  )
  if (!confirmed) return

  isSaving.value = true
  try {
    await appStore.withLoading(async () => {
      const state = await window.api.setInitialBusiness(selectedType.value)
      appStore.businessState = state
      await appStore.loadSettings()
    }, 'جاري تهيئة نشاط البرنامج والقوائم الافتراضية...')
    swalSuccess('تم تهيئة نشاط البرنامج بنجاح!', `تم اعتماد نشاط "${profile.appName}" بنجاح.`)
  } catch (err: any) {
    swalError('فشل الإعداد الأولي', err?.message || 'حدث خطأ أثناء حفظ نشاط البرنامج.')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div
    v-if="appStore.isAuthenticated && appStore.needsBusinessSetup && appStore.isSuperAdmin"
    class="no-print fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
  >
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-3xl w-full p-6 md:p-8 space-y-6"
    >
      <!-- Header -->
      <div class="flex items-start gap-4">
        <div
          class="p-3.5 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25 shrink-0"
        >
          <Sparkles class="w-7 h-7" />
        </div>
        <div>
          <span
            class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 mb-1"
          >
            الإعداد الأولي للنظام — خاص بالسوبر أدمن
          </span>
          <h2 class="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
            مرحباً بك! اختر نشاط البرنامج لبدء التشغيل
          </h2>
          <p class="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            حدد نوع النشاط الذي سيعمل به هذا المركز ليقوم النظام بتهيئة المسميات، القوائم المنسدلة، وإعدادات الطباعة تلقائياً.
          </p>
        </div>
      </div>

      <!-- Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Appliances -->
        <button
          type="button"
          @click="selectedType = 'appliances'"
          :class="[
            'text-right p-5 rounded-2xl border-2 transition-all flex flex-col justify-between gap-4 cursor-pointer',
            selectedType === 'appliances'
              ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 ring-4 ring-purple-600/10'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
          ]"
        >
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Wrench class="w-6 h-6" />
              </div>
              <CheckCircle2
                v-if="selectedType === 'appliances'"
                class="w-5 h-5 text-purple-600"
              />
            </div>
            <h3 class="text-base font-black text-slate-900 dark:text-white">
              {{ BUSINESS_PROFILES.appliances.appName }} — صيانة الأجهزة المنزلية
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              {{ BUSINESS_PROFILES.appliances.centerSubtitleDefault }} ({{ BUSINESS_PROFILES.appliances.defaultDeviceTypes.slice(0, 4).join('، ') }} وغيرها).
            </p>
          </div>
          <div class="pt-3 border-t border-slate-200/70 dark:border-slate-700/60 text-[11px] text-slate-500">
            المصطلحات: جهاز / قطع غيار / فني صيانة
          </div>
        </button>

        <!-- Hearing Aids -->
        <button
          type="button"
          @click="selectedType = 'hearing_aids'"
          :class="[
            'text-right p-5 rounded-2xl border-2 transition-all flex flex-col justify-between gap-4 cursor-pointer',
            selectedType === 'hearing_aids'
              ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 ring-4 ring-purple-600/10'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
          ]"
        >
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Ear class="w-6 h-6" />
              </div>
              <CheckCircle2
                v-if="selectedType === 'hearing_aids'"
                class="w-5 h-5 text-purple-600"
              />
            </div>
            <h3 class="text-base font-black text-slate-900 dark:text-white">
              {{ BUSINESS_PROFILES.hearing_aids.appName }} — مراكز السماعات الطبية والقوقعة
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              مراكز بيع وتجهيز وصيانة السماعات الطبية وأجهزة القوقعة، البطاريات والملحقات، والقوالب الطبية.
            </p>
          </div>
          <div class="pt-3 border-t border-slate-200/70 dark:border-slate-700/60 text-[11px] text-slate-500">
            المصطلحات: سماعة - قوقعة / ملحقات وقطع / أخصائي-فني
          </div>
        </button>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
        <p class="text-xs text-slate-500 dark:text-slate-400">
          يمكنك تعديل هذا الإعداد لاحقاً من شاشة "إعدادات البرنامج (سوبر أدمن)".
        </p>
        <button
          type="button"
          :disabled="isSaving"
          @click="handleConfirmSetup"
          class="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-black shadow-lg shadow-purple-600/25 flex items-center gap-2 cursor-pointer transition"
        >
          <CheckCircle2 class="w-4 h-4" />
          <span>اعتماد النشاط وبدء الاستخدام</span>
        </button>
      </div>
    </div>
  </div>
</template>
