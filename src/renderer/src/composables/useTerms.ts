import { computed } from 'vue'
import { useAppStore } from '../stores/appStore'
import { getBusinessProfile, type BusinessProfile } from '../../../shared/businessProfiles'
import type { BusinessType } from '../../../shared/types'

export function useTerms() {
  const appStore = useAppStore()

  const currentType = computed<BusinessType>(() => appStore.businessType || 'appliances')
  const currentProfile = computed<BusinessProfile>(() => getBusinessProfile(currentType.value))

  function t(key: string, fallback?: string): string {
    const terms = currentProfile.value.terms
    if (terms && terms[key]) {
      return terms[key]
    }
    const defaultTerms = getBusinessProfile('appliances').terms
    if (defaultTerms && defaultTerms[key]) {
      return defaultTerms[key]
    }
    return fallback || key
  }

  return {
    t,
    currentType,
    currentProfile
  }
}

