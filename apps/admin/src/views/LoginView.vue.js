import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, LockKeyhole, Mail } from "@lucide/vue";
import BrandMark from "@/components/BrandMark.vue";
import { useAdminAuthStore } from "@/stores/auth";
const auth = useAdminAuthStore();
const router = useRouter();
const email = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref("");
async function submit() {
    if (submitting.value)
        return;
    submitting.value = true;
    error.value = "";
    try {
        await auth.login(email.value.trim(), password.value);
        await router.replace("/channels");
    }
    catch (reason) {
        error.value = reason instanceof Error ? reason.message : "登录失败";
    }
    finally {
        submitting.value = false;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(error, {});
// @ts-ignore
__VLS_withDotValue(submitting, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "admin-login-page" },
});
/** @type {__VLS_StyleScopedClasses['admin-login-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (submit) },
    ...{ class: "admin-login-panel" },
});
/** @type {__VLS_StyleScopedClasses['admin-login-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-login-brand" },
});
/** @type {__VLS_StyleScopedClasses['admin-login-brand']} */ ;
const __VLS_0 = BrandMark;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
// @ts-ignore
}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "admin-login-hint" },
});
/** @type {__VLS_StyleScopedClasses['admin-login-hint']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "admin-login-input" },
});
/** @type {__VLS_StyleScopedClasses['admin-login-input']} */ ;
let __VLS_5;
/** @ts-ignore @type { | typeof __VLS_components.Mail} */
Mail;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    size: (17),
}));
const __VLS_7 = __VLS_6({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "email",
    autocomplete: "email",
    required: true,
});
(__VLS_unwrap(email, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "admin-login-input" },
});
/** @type {__VLS_StyleScopedClasses['admin-login-input']} */ ;
let __VLS_10;
/** @ts-ignore @type { | typeof __VLS_components.LockKeyhole} */
LockKeyhole;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
    // @ts-ignore
    size: (17),
}));
const __VLS_12 = __VLS_11({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "password",
    autocomplete: "current-password",
    required: true,
});
(__VLS_unwrap(password, {}));
if (error.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "admin-login-error" },
        role: "alert",
    });
    /** @type {__VLS_StyleScopedClasses['admin-login-error']} */ ;
    (error.value);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    type: "submit",
    ...{ class: "admin-login-submit" },
    disabled: (submitting.value),
});
/** @type {__VLS_StyleScopedClasses['admin-login-submit']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(submitting.value ? "登录中" : "登录");
let __VLS_15;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
    // @ts-ignore
    size: (17),
}));
const __VLS_17 = __VLS_16({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
// @ts-ignore
[email, password, error, error, submitting, submitting,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
