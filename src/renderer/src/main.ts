import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ensureWebApiBridge } from './utils/webApiBridge'
import App from './App.vue'
import router from './router'
import SearchableSelect from './components/SearchableSelect.vue'
import { useAppStore } from './stores/appStore'
import './assets/main.css'

ensureWebApiBridge()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.component('SearchableSelect', SearchableSelect)

const appStore = useAppStore(pinia)
appStore.applyTheme()
appStore.applyFontSize()

app.mount('#app')

// Highlight fields whose label is marked with "*" (required) even when they have no
// native `required` attribute, so required fields look different from optional ones.
function markLabelControl(label: HTMLLabelElement): void {
  if (!label.textContent?.includes('*')) return
  const container = label.parentElement
  if (!container) return
  const control = container.querySelector('input, select, textarea') as HTMLElement | null
  if (!control || control.classList.contains('field-required')) return
  const type = (control as HTMLInputElement).type
  if (['checkbox', 'radio', 'file', 'hidden'].includes(type)) return
  control.classList.add('field-required')
}

function markRequiredFields(root: ParentNode = document): void {
  if (root instanceof HTMLLabelElement) {
    markLabelControl(root)
    return
  }
  root.querySelectorAll('label').forEach((label) => markLabelControl(label))
}

const pendingRoots = new Set<Element>()
let markRafId: number | null = null

function flushPendingRequiredFields(): void {
  markRafId = null
  pendingRoots.forEach((el) => {
    if (el.isConnected) markRequiredFields(el)
  })
  pendingRoots.clear()
}

new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) {
        pendingRoots.add(node)
      }
    }
  }
  if (pendingRoots.size > 0 && markRafId === null) {
    markRafId = requestAnimationFrame(flushPendingRequiredFields)
  }
}).observe(document.body, {
  childList: true,
  subtree: true
})
markRequiredFields()