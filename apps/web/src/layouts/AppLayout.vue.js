import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Boxes, Clapperboard, House, LogOut, Menu, X, } from "@lucide/vue";
import BrandMark from "@/components/BrandMark.vue";
import { useAppStore } from "@/stores/app";
import { useAuthStore } from "@/stores/auth";
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const primaryNavigation = [
    { label: "创作", path: "/", icon: House },
    { label: "素材", path: "/assets", icon: Boxes },
];
const currentTitle = computed(() => String(route.meta.title || "创作工作台"));
const isActive = (path) => (path === "/" ? route.path === "/" : route.path.startsWith(path));
async function logout() {
    authStore.logout();
    await router.replace("/login");
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(appStore, {});
// @ts-ignore
__VLS_withDotValue(authStore, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "app-shell" },
});
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ class: "sidebar" },
    ...{ class: ({ 'sidebar--open': appStore.value.mobileNavigationOpen }) },
});
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar--open']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sidebar__brand" },
});
/** @type {__VLS_StyleScopedClasses['sidebar__brand']} */ ;
const __VLS_0 = BrandMark;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
// @ts-ignore
}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (appStore.value.closeMobileNavigation) },
    ...{ class: "icon-button sidebar__close" },
    type: "button",
    'aria-label': "关闭导航",
});
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar__close']} */ ;
let __VLS_5;
/** @ts-ignore @type { | typeof __VLS_components.X} */
X;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    size: (18),
}));
const __VLS_7 = __VLS_6({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
    ...{ class: "sidebar__nav" },
    'aria-label': "主要导航",
});
/** @type {__VLS_StyleScopedClasses['sidebar__nav']} */ ;
const __VLS_10 = __VLS_tryAsConstant((__VLS_unwrap(primaryNavigation, {})));
for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
    let __VLS_11;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        // @ts-ignore
        ...{ 'onClick': {} }, key: (item.path), to: (item.path), ...{ class: "nav-item" }, ...{ class: ({ 'nav-item--active': __VLS_unwrap(isActive, {})(item.path) }) },
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onClick': {} },
        key: (item.path),
        to: (item.path),
        ...{ class: "nav-item" },
        ...{ class: ({ 'nav-item--active': __VLS_unwrap(isActive, {})(item.path) }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_16;
    const __VLS_17 = {
        /** @type {typeof __VLS_16.click} */
        onClick: (appStore.value.closeMobileNavigation),
    };
    void __VLS_17;
    /** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['nav-item--active']} */ ;
    const { default: __VLS_18 } = __VLS_nonNull(__VLS_14.slots);
    const __VLS_19 = (item.icon);
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_21 = __VLS_20({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (item.label);
    // @ts-ignore
    [appStore, appStore, appStore, primaryNavigation, isActive,];
    var __VLS_14;
    var __VLS_15;
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sidebar__bottom" },
});
/** @type {__VLS_StyleScopedClasses['sidebar__bottom']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "profile-strip" },
});
/** @type {__VLS_StyleScopedClasses['profile-strip']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "profile-strip__avatar" },
});
/** @type {__VLS_StyleScopedClasses['profile-strip__avatar']} */ ;
(authStore.value.userInitial);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "profile-strip__copy" },
});
/** @type {__VLS_StyleScopedClasses['profile-strip__copy']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(authStore.value.user?.username);
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
(authStore.value.user?.email);
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (logout) },
    type: "button",
    'aria-label': "退出登录",
    title: "退出登录",
});
let __VLS_24;
/** @ts-ignore @type { | typeof __VLS_components.LogOut} */
LogOut;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
    // @ts-ignore
    size: (16),
}));
const __VLS_26 = __VLS_25({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
if (appStore.value.mobileNavigationOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button)({
        ...{ onClick: (appStore.value.closeMobileNavigation) },
        ...{ class: "sidebar-backdrop" },
        type: "button",
        'aria-label': "关闭导航",
    });
    /** @type {__VLS_StyleScopedClasses['sidebar-backdrop']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "app-main" },
});
/** @type {__VLS_StyleScopedClasses['app-main']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "mobile-header" },
});
/** @type {__VLS_StyleScopedClasses['mobile-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (appStore.value.toggleMobileNavigation) },
    ...{ class: "icon-button" },
    type: "button",
    'aria-label': "打开导航",
});
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
let __VLS_29;
/** @ts-ignore @type { | typeof __VLS_components.Menu} */
Menu;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
    // @ts-ignore
    size: (20),
}));
const __VLS_31 = __VLS_30({
    size: (20),
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "mobile-header__title" },
});
/** @type {__VLS_StyleScopedClasses['mobile-header__title']} */ ;
let __VLS_34;
/** @ts-ignore @type { | typeof __VLS_components.Clapperboard} */
Clapperboard;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
    // @ts-ignore
    size: (17),
}));
const __VLS_36 = __VLS_35({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_unwrap(currentTitle, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "profile-strip__avatar profile-strip__avatar--small" },
});
/** @type {__VLS_StyleScopedClasses['profile-strip__avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-strip__avatar--small']} */ ;
(authStore.value.userInitial);
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "page-scroll" },
});
/** @type {__VLS_StyleScopedClasses['page-scroll']} */ ;
let __VLS_39;
/** @ts-ignore @type { | typeof __VLS_components.RouterView} */
RouterView;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
// @ts-ignore
}));
const __VLS_41 = __VLS_40({}, ...__VLS_functionalComponentArgsRest(__VLS_40));
// @ts-ignore
[appStore, appStore, appStore, authStore, authStore, authStore, authStore, currentTitle,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
