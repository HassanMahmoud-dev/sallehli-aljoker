import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

function getThemeColors(): {
  background: string
  color: string
} {
  const dark = isDarkMode()
  return {
    background: dark ? '#0f172a' : '#ffffff',
    color: dark ? '#f8fafc' : '#0f172a'
  }
}

export function swalSuccess(title: string, text?: string): void {
  const { background, color } = getThemeColors()
  Swal.fire({
    toast: true,
    position: 'top',
    icon: 'success',
    title,
    text,
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    background,
    color,
    customClass: {
      popup: 'rounded-2xl shadow-2xl border border-emerald-500/30 font-sans text-right'
    }
  })
}

export function swalError(title: string, text?: string): void {
  const { background, color } = getThemeColors()
  Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'حسناً',
    confirmButtonColor: '#e11d48',
    background,
    color,
    customClass: {
      popup: 'rounded-3xl shadow-2xl border border-rose-500/30 font-sans',
      confirmButton: 'rounded-xl font-bold px-6 py-2.5 text-xs cursor-pointer'
    }
  })
}

export function swalWarning(title: string, text?: string): void {
  const { background, color } = getThemeColors()
  Swal.fire({
    icon: 'warning',
    title,
    text,
    confirmButtonText: 'حسناً',
    confirmButtonColor: '#d97706',
    background,
    color,
    customClass: {
      popup: 'rounded-3xl shadow-2xl border border-amber-500/30 font-sans',
      confirmButton: 'rounded-xl font-bold px-6 py-2.5 text-xs cursor-pointer'
    }
  })
}

export async function swalConfirm(
  title: string,
  text?: string,
  confirmButtonText = 'نعم، تأكيد الحذف',
  cancelButtonText = 'إلغاء'
): Promise<boolean> {
  const { background, color } = getThemeColors()
  const res = await Swal.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#475569',
    reverseButtons: true,
    background,
    color,
    customClass: {
      popup: 'rounded-3xl shadow-2xl border border-slate-500/20 font-sans',
      confirmButton: 'rounded-xl font-bold px-5 py-2.5 text-xs cursor-pointer',
      cancelButton: 'rounded-xl font-bold px-5 py-2.5 text-xs cursor-pointer'
    }
  })
  return Boolean(res.isConfirmed)
}

export default Swal
