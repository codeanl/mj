import { nextTick, onBeforeUnmount, watch, type Ref } from "vue"

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

const dialogStack: symbol[] = []
const inertedElements = new Map<HTMLElement, { count: number; wasInert: boolean }>()

function focusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => (
    element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
  ))
}

export function useModalDialog(open: Ref<boolean>, panel: Ref<HTMLElement | null>, close: () => void) {
  const token = Symbol("modal-dialog")
  let returnFocus: HTMLElement | null = null
  let active = false
  let background: HTMLElement[] = []

  function disableBackground() {
    let current: HTMLElement | null = panel.value
    while (current?.parentElement && current.parentElement !== document.body) {
      const parent: HTMLElement = current.parentElement
      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === current) continue
        const state = inertedElements.get(sibling)
        if (state) state.count++
        else {
          inertedElements.set(sibling, { count: 1, wasInert: sibling.inert })
          sibling.inert = true
        }
        background.push(sibling)
      }
      current = parent
    }
  }

  function restoreBackground() {
    for (const element of background) {
      const state = inertedElements.get(element)
      if (!state) continue
      state.count--
      if (state.count === 0) {
        element.inert = state.wasInert
        inertedElements.delete(element)
      }
    }
    background = []
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!active || dialogStack.at(-1) !== token) return
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== "Tab" || !panel.value) return
    const elements = focusableElements(panel.value)
    if (!elements.length) {
      event.preventDefault()
      panel.value.focus()
      return
    }
    const first = elements[0]
    const last = elements.at(-1) as HTMLElement
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function activate() {
    if (active) return
    active = true
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogStack.push(token)
    await nextTick()
    disableBackground()
    document.addEventListener("keydown", handleKeydown, true)
    const target = panel.value?.querySelector<HTMLElement>("[data-dialog-initial-focus], [autofocus]")
      || (panel.value ? focusableElements(panel.value)[0] : null)
      || panel.value
    target?.focus()
  }

  function deactivate() {
    if (!active) return
    active = false
    document.removeEventListener("keydown", handleKeydown, true)
    const index = dialogStack.lastIndexOf(token)
    if (index >= 0) dialogStack.splice(index, 1)
    restoreBackground()
    const target = returnFocus
    returnFocus = null
    void nextTick(() => {
      if (target?.isConnected) target.focus()
    })
  }

  watch(open, (isOpen) => {
    if (isOpen) void activate()
    else deactivate()
  }, { immediate: true, flush: "post" })

  onBeforeUnmount(deactivate)
}
