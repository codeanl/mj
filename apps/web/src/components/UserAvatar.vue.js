import { useAuthStore } from "@/stores/auth";
const authStore = useAuthStore();
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(authStore, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "user-avatar" },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['user-avatar']} */ ;
if (authStore.value.avatarObjectUrl) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
        src: (authStore.value.avatarObjectUrl),
        alt: "",
    });
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (authStore.value.userInitial);
}
// @ts-ignore
[authStore, authStore, authStore,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
