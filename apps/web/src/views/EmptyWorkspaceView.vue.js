import { computed } from "vue";
import { useRoute } from "vue-router";
import { Construction } from "@lucide/vue";
const route = useRoute();
const title = computed(() => String(route.meta.title || "功能页面"));
const description = computed(() => String(route.meta.description || "该功能将在后续阶段接入。"));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "empty-workspace" },
});
/** @type {__VLS_StyleScopedClasses['empty-workspace']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "empty-workspace__heading" },
});
/** @type {__VLS_StyleScopedClasses['empty-workspace__heading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
(__VLS_unwrap(title, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_unwrap(description, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "empty-workspace__body" },
});
/** @type {__VLS_StyleScopedClasses['empty-workspace__body']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.Construction} */
Construction;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    size: (30),
}));
const __VLS_2 = __VLS_1({
    size: (30),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
// @ts-ignore
[title, description,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
