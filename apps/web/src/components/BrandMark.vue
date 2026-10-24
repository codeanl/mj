<template>
  <span class="brand-mark" aria-hidden="true">
    <span class="brand-mark__shape brand-mark__shape--left" />
    <span class="brand-mark__shape brand-mark__shape--right" />
  </span>
</template>

<style scoped>
.brand-mark {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 28px;
}

.brand-mark__shape {
  position: absolute;
  top: 5px;
  width: 22px;
  height: 18px;
  border: 6px solid currentColor;
  border-radius: 7px;
  transform: rotate(42deg);
}

.brand-mark__shape--left {
  left: 1px;
  color: #4f7cff;
}

.brand-mark__shape--right {
  right: 1px;
  color: #ed5bb4;
  transform: rotate(-42deg);
}
</style>

