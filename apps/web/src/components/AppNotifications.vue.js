import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "@lucide/vue";
import { activeNotification, dismissNotification } from "@/services/notifications";
const icons = { success: CircleCheck, error: CircleAlert, info: Info, warning: TriangleAlert };
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(activeNotification, {});
// @ts-ignore
__VLS_withDotValue(icons, {});
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
Transition;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    name: "app-notice",
}));
const __VLS_2 = __VLS_1({
    name: "app-notice",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
if (activeNotification.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (activeNotification.value.id),
        ...{ class: "app-notification" },
        ...{ class: (`is-${activeNotification.value.kind}`) },
        role: "status",
        'aria-live': "polite",
    });
    /** @type {__VLS_StyleScopedClasses['app-notification']} */ ;
    const __VLS_6 = (icons.value[activeNotification.value.kind]);
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        size: (17),
    }));
    const __VLS_8 = __VLS_7({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (activeNotification.value.message);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_unwrap(dismissNotification, {})) },
        type: "button",
        'aria-label': "关闭提示",
    });
    let __VLS_11;
    /** @ts-ignore @type { | typeof __VLS_components.X} */
    X;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_13 = __VLS_12({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
}
// @ts-ignore
[activeNotification, activeNotification, activeNotification, activeNotification, activeNotification, icons, dismissNotification,];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
