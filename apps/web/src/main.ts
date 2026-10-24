import { createApp } from "vue"
import { createPinia } from "pinia"
import { ElOption, ElSelect } from "element-plus"
import "element-plus/theme-chalk/base.css"
import "element-plus/theme-chalk/el-select.css"
import "element-plus/theme-chalk/el-option.css"
import "element-plus/theme-chalk/el-message.css"
import "./styles/index.css"

import App from "./App.vue"
import router from "./router"

createApp(App).use(createPinia()).use(router).component("ElSelect", ElSelect).component("ElOption", ElOption).mount("#app")
