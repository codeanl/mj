import { createApp } from "vue"
import { createPinia } from "pinia"
import { ElButton } from "element-plus"
import "element-plus/theme-chalk/base.css"
import "element-plus/theme-chalk/el-button.css"
import "./styles/index.css"

import App from "./App.vue"
import router from "./router"

createApp(App).use(createPinia()).use(router).component("ElButton", ElButton).mount("#app")
