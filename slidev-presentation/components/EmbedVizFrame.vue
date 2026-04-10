<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    url: string
    frameWidth?: number
    frameHeight?: number
    paddingX?: number
    paddingY?: number
    marginTop?: number
    maxScale?: number
  }>(),
  {
    frameWidth: 1360,
    frameHeight: 1120,
    paddingX: 0,
    paddingY: 0,
    marginTop: 0,
    maxScale: 1,
  }
)

const hostRef = ref<HTMLElement | null>(null)
const hostWidth = ref(980)
const hostHeight = ref(552)

let resizeObserver: ResizeObserver | null = null

function measure() {
  const el = hostRef.value
  if (!el) return

  const slideContent = el.closest('.slidev-slide-content') as HTMLElement | null
  const parent = el.parentElement as HTMLElement | null

  hostWidth.value =
    slideContent?.clientWidth ||
    parent?.clientWidth ||
    el.clientWidth ||
    980

  hostHeight.value =
    slideContent?.clientHeight ||
    parent?.clientHeight ||
    el.clientHeight ||
    552
}

const availableWidth = computed(() =>
  Math.max(hostWidth.value - props.paddingX * 2, 320)
)

const availableHeight = computed(() =>
  Math.max(hostHeight.value - props.paddingY * 2 - props.marginTop, 240)
)

const scale = computed(() =>
  Math.min(
    props.maxScale,
    availableWidth.value / props.frameWidth,
    availableHeight.value / props.frameHeight
  )
)

const scaledWidth = computed(() => props.frameWidth * scale.value)
const scaledHeight = computed(() => props.frameHeight * scale.value)

onMounted(() => {
  measure()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measure()
    })

    if (hostRef.value) {
      resizeObserver.observe(hostRef.value)
      if (hostRef.value.parentElement) {
        resizeObserver.observe(hostRef.value.parentElement)
      }
    }
  }

  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    ref="hostRef"
    :style="{
      width: '100%',
      height: '100%',
      minHeight: '552px',
      paddingTop: `${props.marginTop}px`,
      boxSizing: 'border-box',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
    }"
  >
    <div
      :style="{
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        overflow: 'hidden',
        flex: '0 0 auto',
      }"
    >
      <iframe
        :src="props.url"
        frameborder="0"
        scrolling="no"
        :style="{
          width: `${props.frameWidth}px`,
          height: `${props.frameHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 'none',
          display: 'block',
        }"
      />
    </div>
  </div>
</template>
