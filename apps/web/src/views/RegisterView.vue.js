import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "@lucide/vue";
import BrandMark from "@/components/BrandMark.vue";
import { apiErrorMessage } from "@/services/http";
import { useAuthStore } from "@/stores/auth";
const router = useRouter();
const auth = useAuthStore();
const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const passwordVisible = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
async function submit() {
    if (submitting.value)
        return;
    errorMessage.value = "";
    if (password.value !== confirmPassword.value) {
        errorMessage.value = "两次输入的密码不一致";
        return;
    }
    submitting.value = true;
    try {
        await auth.register({ email: email.value, username: username.value, password: password.value });
        await router.replace("/");
    }
    catch (error) {
        errorMessage.value = apiErrorMessage(error, "注册失败");
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
__VLS_withDotValue(passwordVisible, {});
// @ts-ignore
__VLS_withDotValue(errorMessage, {});
// @ts-ignore
__VLS_withDotValue(submitting, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "auth-page" },
});
/** @type {__VLS_StyleScopedClasses['auth-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "auth-visual auth-visual--register" },
    'aria-label': "Nova Studio",
});
/** @type {__VLS_StyleScopedClasses['auth-visual']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-visual--register']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-brand auth-brand--light" },
});
/** @type {__VLS_StyleScopedClasses['auth-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-brand--light']} */ ;
const __VLS_0 = BrandMark;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
// @ts-ignore
}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-visual__copy" },
});
/** @type {__VLS_StyleScopedClasses['auth-visual__copy']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.br)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "auth-visual__foot" },
});
/** @type {__VLS_StyleScopedClasses['auth-visual__foot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "auth-panel" },
});
/** @type {__VLS_StyleScopedClasses['auth-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-panel__inner" },
});
/** @type {__VLS_StyleScopedClasses['auth-panel__inner']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-brand auth-brand--mobile" },
});
/** @type {__VLS_StyleScopedClasses['auth-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-brand--mobile']} */ ;
const __VLS_5 = BrandMark;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
// @ts-ignore
}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "auth-eyebrow" },
});
/** @type {__VLS_StyleScopedClasses['auth-eyebrow']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "auth-subtitle" },
});
/** @type {__VLS_StyleScopedClasses['auth-subtitle']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (submit) },
    ...{ class: "auth-form" },
});
/** @type {__VLS_StyleScopedClasses['auth-form']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "auth-input" },
});
/** @type {__VLS_StyleScopedClasses['auth-input']} */ ;
let __VLS_10;
/** @ts-ignore @type { | typeof __VLS_components.UserRound} */
UserRound;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
    // @ts-ignore
    size: (17),
}));
const __VLS_12 = __VLS_11({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    value: (__VLS_unwrap(username, {})),
    type: "text",
    autocomplete: "username",
    minlength: "2",
    maxlength: "32",
    placeholder: "你的显示名称",
    required: true,
});
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "auth-input" },
});
/** @type {__VLS_StyleScopedClasses['auth-input']} */ ;
let __VLS_15;
/** @ts-ignore @type { | typeof __VLS_components.Mail} */
Mail;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
    // @ts-ignore
    size: (17),
}));
const __VLS_17 = __VLS_16({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "email",
    autocomplete: "email",
    placeholder: "name@example.com",
    required: true,
});
(__VLS_unwrap(email, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "auth-input" },
});
/** @type {__VLS_StyleScopedClasses['auth-input']} */ ;
let __VLS_20;
/** @ts-ignore @type { | typeof __VLS_components.LockKeyhole} */
LockKeyhole;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
    // @ts-ignore
    size: (17),
}));
const __VLS_22 = __VLS_21({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: (passwordVisible.value ? 'text' : 'password'),
    autocomplete: "new-password",
    minlength: "8",
    maxlength: "72",
    placeholder: "至少 8 位密码",
    required: true,
});
(__VLS_unwrap(password, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (passwordVisible.value = !passwordVisible.value);
            // @ts-ignore
            [username, email, passwordVisible, passwordVisible, passwordVisible, password,];
        } },
    type: "button",
    'aria-label': (passwordVisible.value ? '隐藏密码' : '显示密码'),
});
if (passwordVisible.value) {
    let __VLS_25;
    /** @ts-ignore @type { | typeof __VLS_components.EyeOff} */
    EyeOff;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        // @ts-ignore
        size: (17),
    }));
    const __VLS_27 = __VLS_26({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
}
else {
    let __VLS_30;
    /** @ts-ignore @type { | typeof __VLS_components.Eye} */
    Eye;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        // @ts-ignore
        size: (17),
    }));
    const __VLS_32 = __VLS_31({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "auth-input" },
});
/** @type {__VLS_StyleScopedClasses['auth-input']} */ ;
let __VLS_35;
/** @ts-ignore @type { | typeof __VLS_components.LockKeyhole} */
LockKeyhole;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
    // @ts-ignore
    size: (17),
}));
const __VLS_37 = __VLS_36({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: (passwordVisible.value ? 'text' : 'password'),
    autocomplete: "new-password",
    minlength: "8",
    maxlength: "72",
    placeholder: "再次输入密码",
    required: true,
});
(__VLS_unwrap(confirmPassword, {}));
if (errorMessage.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "auth-error" },
        role: "alert",
    });
    /** @type {__VLS_StyleScopedClasses['auth-error']} */ ;
    (errorMessage.value);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ class: "auth-submit" },
    type: "submit",
    disabled: (submitting.value),
});
/** @type {__VLS_StyleScopedClasses['auth-submit']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(submitting.value ? "创建中…" : "创建账号");
let __VLS_40;
/** @ts-ignore @type { | typeof __VLS_components.ArrowRight} */
ArrowRight;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
    // @ts-ignore
    size: (17),
}));
const __VLS_42 = __VLS_41({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "auth-switch" },
});
/** @type {__VLS_StyleScopedClasses['auth-switch']} */ ;
let __VLS_45;
/** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
RouterLink;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
    // @ts-ignore
    to: "/login",
}));
const __VLS_47 = __VLS_46({
    to: "/login",
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
const { default: __VLS_50 } = __VLS_nonNull(__VLS_48.slots);
// @ts-ignore
[passwordVisible, passwordVisible, passwordVisible, confirmPassword, errorMessage, errorMessage, submitting, submitting,];
var __VLS_48;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
