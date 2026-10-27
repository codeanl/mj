import { createApp } from "vue"
import "./styles/index.css"

import App from "./App.vue"
import router from "./router"
import { setUnauthorizedHandler } from "./services/http"
import { useAuthStore } from "./stores/auth"
import { pinia } from "./stores"

const app = createApp(App)

app.use(pinia).use(router)

setUnauthorizedHandler(() => {
  const auth = useAuthStore(pinia)
  const currentRoute = router.currentRoute.value
  const redirect = currentRoute.meta.requiresAuth ? currentRoute.fullPath : ""
  auth.clearSession()
  if (currentRoute.name !== "login") {
    void router.replace({ name: "login", query: redirect && redirect !== "/" ? { redirect } : undefined })
  }
})

app.mount("#app")
