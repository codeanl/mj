import { createApp } from "vue"
import { createPinia } from "pinia"
import "element-plus/theme-chalk/dark/css-vars.css"
import "./styles/index.css"

import App from "./App.vue"
import router from "./router"
import { setUnauthorizedHandler } from "./services/http"
import { useAdminAuthStore } from "./stores/auth"
import { useAdminThemeStore } from "./stores/theme"

const app = createApp(App)
const pinia = createPinia()

app.use(pinia).use(router)
useAdminThemeStore(pinia).apply()
setUnauthorizedHandler(() => {
  useAdminAuthStore(pinia).clearSession()
  if (router.currentRoute.value.path !== "/login") void router.replace("/login")
})
app.mount("#app")
