/**
 * Delays invoking `fn` until `delayMs` milliseconds have elapsed since the last call.
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delayMs = 250): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delayMs)
  }
}
