<template>
  <span class="brand-mark" aria-hidden="true">
    <span />
    <span />
  </span>
</template>

<style scoped>
.brand-mark { position: relative; display: inline-block; width: 28px; height: 22px; }
.brand-mark span { position: absolute; top: 4px; width: 17px; height: 14px; border: 5px solid #5269f3; border-radius: 5px; transform: rotate(42deg); }
.brand-mark span:first-child { left: 0; }
.brand-mark span:last-child { right: 0; border-color: #db579f; transform: rotate(-42deg); }
</style>

