import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ensureWebApiBridge } from './utils/webApiBridge'
import App from './App.vue'
import router from './router'
import './assets/main.css'

ensureWebApiBridge()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Highlight fields whose label is marked with "*" (required) even when they have no
// native `required` attribute, so required fields look different from optional ones.
function markRequiredFields(root: ParentNode = document): void {
  root.querySelectorAll('label').forEach((label) => {
    if (!label.textContent?.includes('*')) return
    const container = label.parentElement
    if (!container) return
    const control = container.querySelector('input, select, textarea') as HTMLElement | null
    if (!control) return
    const type = (control as HTMLInputElement).type
    if (['checkbox', 'radio', 'file', 'hidden'].includes(type)) return
    control.classList.add('field-required')
  })
}

new MutationObserver(() => markRequiredFields()).observe(document.body, {
  childList: true,
  subtree: true
})
markRequiredFields()