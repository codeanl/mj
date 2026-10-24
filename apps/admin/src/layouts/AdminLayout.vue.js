import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { Activity, Bell, Bot, Boxes, ChevronLeft, CircleDollarSign, ClipboardList, Database, FileClock, Gauge, Menu, Search, Settings, ShieldCheck, UsersRound, X, } from "@lucide/vue";
import BrandMark from "@/components/BrandMark.vue";
const route = useRoute();
const mobileOpen = ref(false);
const collapsed = ref(false);
const groups = [
    { title: "经营分析", items: [{ label: "经营概览", path: "/overview", icon: Gauge }, { label: "用户管理", path: "/users", icon: UsersRound }] },
    { title: "AI 能力", items: [{ label: "模型渠道", path: "/channels", icon: Bot }, { label: "逻辑模型", path: "/models", icon: Database }, { label: "生成任务", path: "/generation", icon: Activity }] },
    { title: "平台运营", items: [{ label: "媒体资产", path: "/assets", icon: Boxes }, { label: "计费中心", path: "/billing", icon: CircleDollarSign }, { label: "内容运营", path: "/content", icon: ClipboardList }] },
    { title: "系统管理", items: [{ label: "审计日志", path: "/audit", icon: FileClock }, { label: "系统设置", path: "/settings", icon: Settings }] },
];
const title = computed(() => String(route.meta.title || "管理控制台"));
const description = computed(() => String(route.meta.description || ""));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(collapsed, {});
// @ts-ignore
__VLS_withDotValue(mobileOpen, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-shell" },
    ...{ class: ({ 'admin-shell--collapsed': collapsed.value }) },
});
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-shell--collapsed']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ class: "admin-sidebar" },
    ...{ class: ({ 'admin-sidebar--open': mobileOpen.value }) },
});
/** @type {__VLS_StyleScopedClasses['admin-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-sidebar--open']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-brand" },
});
/** @type {__VLS_StyleScopedClasses['admin-brand']} */ ;
const __VLS_0 = BrandMark;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
// @ts-ignore
}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
if (!collapsed.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (mobileOpen.value = false);
            // @ts-ignore
            [collapsed, collapsed, mobileOpen, mobileOpen,];
        } },
    ...{ class: "icon-button mobile-only" },
    type: "button",
    'aria-label': "关闭菜单",
});
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-only']} */ ;
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
    ...{ class: "admin-nav" },
    'aria-label': "后台导航",
});
/** @type {__VLS_StyleScopedClasses['admin-nav']} */ ;
const __VLS_10 = __VLS_tryAsConstant((__VLS_unwrap(groups, {})));
for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        key: (group.title),
    });
    if (!collapsed.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (group.title);
    }
    const __VLS_11 = __VLS_tryAsConstant((group.items));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
        let __VLS_12;
        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
        RouterLink;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            ...{ 'onClick': {} }, key: (item.path), to: (item.path), title: (collapsed.value ? item.label : undefined),
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onClick': {} },
            key: (item.path),
            to: (item.path),
            title: (collapsed.value ? item.label : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_17;
        const __VLS_18 = {
            /** @type {typeof __VLS_17.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                return (mobileOpen.value = false);
                // @ts-ignore
                [collapsed, collapsed, mobileOpen, groups,];
            },
        };
        void __VLS_18;
        const { default: __VLS_19 } = __VLS_nonNull(__VLS_15.slots);
        const __VLS_20 = (item.icon);
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
            // @ts-ignore
            size: (17),
        }));
        const __VLS_22 = __VLS_21({
            size: (17),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        if (!collapsed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (item.label);
        }
        // @ts-ignore
        [collapsed,];
        var __VLS_15;
        var __VLS_16;
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-user" },
});
/** @type {__VLS_StyleScopedClasses['admin-user']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "admin-user__avatar" },
});
/** @type {__VLS_StyleScopedClasses['admin-user__avatar']} */ ;
if (!collapsed.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
}
if (mobileOpen.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(mobileOpen.value))
                    throw 0;
                return (mobileOpen.value = false);
                // @ts-ignore
                [collapsed, mobileOpen, mobileOpen,];
            } },
        ...{ class: "admin-backdrop" },
        type: "button",
        'aria-label': "关闭菜单",
    });
    /** @type {__VLS_StyleScopedClasses['admin-backdrop']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-main" },
});
/** @type {__VLS_StyleScopedClasses['admin-main']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "admin-header" },
});
/** @type {__VLS_StyleScopedClasses['admin-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (collapsed.value = !collapsed.value);
            // @ts-ignore
            [collapsed, collapsed,];
        } },
    ...{ class: "icon-button desktop-only" },
    type: "button",
    'aria-label': (collapsed.value ? '展开侧栏' : '收起侧栏'),
});
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['desktop-only']} */ ;
let __VLS_25;
/** @ts-ignore @type { | typeof __VLS_components.ChevronLeft} */
ChevronLeft;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
    // @ts-ignore
    size: (18),
}));
const __VLS_27 = __VLS_26({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (mobileOpen.value = true);
            // @ts-ignore
            [collapsed, mobileOpen,];
        } },
    ...{ class: "icon-button mobile-only" },
    type: "button",
    'aria-label': "打开菜单",
});
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-only']} */ ;
let __VLS_30;
/** @ts-ignore @type { | typeof __VLS_components.Menu} */
Menu;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
    // @ts-ignore
    size: (19),
}));
const __VLS_32 = __VLS_31({
    size: (19),
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-header__search" },
});
/** @type {__VLS_StyleScopedClasses['admin-header__search']} */ ;
let __VLS_35;
/** @ts-ignore @type { | typeof __VLS_components.Search} */
Search;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
    // @ts-ignore
    size: (16),
}));
const __VLS_37 = __VLS_36({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ class: "icon-button" },
    type: "button",
    'aria-label': "通知",
});
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
let __VLS_40;
/** @ts-ignore @type { | typeof __VLS_components.Bell} */
Bell;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
    // @ts-ignore
    size: (18),
}));
const __VLS_42 = __VLS_41({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "admin-header__status" },
});
/** @type {__VLS_StyleScopedClasses['admin-header__status']} */ ;
let __VLS_45;
/** @ts-ignore @type { | typeof __VLS_components.ShieldCheck} */
ShieldCheck;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
    // @ts-ignore
    size: (15),
}));
const __VLS_47 = __VLS_46({
    size: (15),
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "admin-content" },
});
/** @type {__VLS_StyleScopedClasses['admin-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-page-heading" },
});
/** @type {__VLS_StyleScopedClasses['admin-page-heading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
(__VLS_unwrap(title, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_unwrap(description, {}));
let __VLS_50;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
    // @ts-ignore
    type: "primary",
}));
const __VLS_52 = __VLS_51({
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_51));
const { default: __VLS_55 } = __VLS_nonNull(__VLS_53.slots);
// @ts-ignore
[title, description,];
var __VLS_53;
let __VLS_56;
/** @ts-ignore @type { | typeof __VLS_components.RouterView} */
RouterView;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
// @ts-ignore
}));
const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
