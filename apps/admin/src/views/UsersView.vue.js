import { computed, onMounted, reactive, ref } from "vue";
import { ElButton, ElDialog, ElInput, ElInputNumber, ElMessage, ElOption, ElPagination, ElSelect } from "element-plus";
import "element-plus/dist/index.css";
import { Coins, KeyRound, LoaderCircle, Pencil, Search, ShieldCheck, UserPlus, UserRound, UsersRound } from "@lucide/vue";
import * as pointApi from "@/services/points";
import * as userApi from "@/services/users";
const users = ref([]);
const summary = ref({ total: 0, active: 0, admins: 0, disabled: 0, totalPoints: 0 });
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const searchDraft = ref("");
const search = ref("");
const roleFilter = ref("");
const statusFilter = ref("");
const loading = ref(true);
const saving = ref(false);
const editorOpen = ref(false);
const passwordOpen = ref(false);
const pointsOpen = ref(false);
const editingAccountId = ref(null);
const passwordAccountId = ref(null);
const password = ref("");
const pointsAccountId = ref(null);
const pointsAmount = ref(0);
const pointsDescription = ref("");
let loadSequence = 0;
const form = reactive({ email: "", username: "", role: "user", status: "active", password: "" });
const editingUser = computed(() => users.value.find((user) => user.accountId === editingAccountId.value));
const passwordUser = computed(() => users.value.find((user) => user.accountId === passwordAccountId.value));
const pointsUser = computed(() => users.value.find((user) => user.accountId === pointsAccountId.value));
onMounted(() => void loadUsers());
async function loadUsers() {
    const sequence = ++loadSequence;
    loading.value = true;
    try {
        const result = await userApi.listUsers({ page: page.value, pageSize: pageSize.value, search: search.value, role: roleFilter.value || undefined, status: statusFilter.value || undefined });
        if (sequence !== loadSequence)
            return;
        users.value = result.items;
        total.value = result.total;
        summary.value = result.summary;
    }
    catch (error) {
        if (sequence === loadSequence)
            ElMessage.error(messageOf(error, "用户加载失败"));
    }
    finally {
        if (sequence === loadSequence)
            loading.value = false;
    }
}
function submitSearch() {
    search.value = searchDraft.value.trim();
    page.value = 1;
    void loadUsers();
}
function applyFilters() {
    page.value = 1;
    void loadUsers();
}
function changePage(nextPage) {
    page.value = nextPage;
    void loadUsers();
}
function changePageSize(nextPageSize) {
    pageSize.value = nextPageSize;
    page.value = 1;
    void loadUsers();
}
function openCreate() {
    editingAccountId.value = null;
    Object.assign(form, { email: "", username: "", role: "user", status: "active", password: "" });
    editorOpen.value = true;
}
function openEdit(user) {
    editingAccountId.value = user.accountId;
    Object.assign(form, { email: user.email, username: user.username, role: user.role, status: user.status, password: "" });
    editorOpen.value = true;
}
async function saveUser() {
    if (!form.email.trim() || !form.username.trim())
        return ElMessage.warning("请填写邮箱和用户名");
    if (!editingAccountId.value && form.password.length < 8)
        return ElMessage.warning("初始密码至少 8 位");
    saving.value = true;
    try {
        if (editingAccountId.value)
            await userApi.updateUser(editingAccountId.value, { email: form.email, username: form.username, role: form.role, status: form.status });
        else
            await userApi.createUser(form);
        editorOpen.value = false;
        await loadUsers();
        ElMessage.success(editingAccountId.value ? "用户已更新" : "用户已创建");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "用户保存失败"));
    }
    finally {
        saving.value = false;
    }
}
function openPassword(user) {
    passwordAccountId.value = user.accountId;
    password.value = "";
    passwordOpen.value = true;
}
async function resetPassword() {
    if (!passwordAccountId.value || password.value.length < 8)
        return ElMessage.warning("新密码至少 8 位");
    saving.value = true;
    try {
        await userApi.resetUserPassword(passwordAccountId.value, password.value);
        passwordOpen.value = false;
        password.value = "";
        ElMessage.success("用户密码已重置");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "密码重置失败"));
    }
    finally {
        saving.value = false;
    }
}
function openPoints(user) {
    pointsAccountId.value = user.accountId;
    pointsAmount.value = 0;
    pointsDescription.value = "";
    pointsOpen.value = true;
}
async function adjustPoints() {
    if (!pointsAccountId.value || !Number.isFinite(pointsAmount.value) || pointsAmount.value === 0)
        return ElMessage.warning("请输入非零积分调整值");
    if (pointsDescription.value.trim().length < 2)
        return ElMessage.warning("请填写调整原因");
    saving.value = true;
    try {
        await pointApi.adjustUserPoints(pointsAccountId.value, pointsAmount.value, pointsDescription.value.trim());
        pointsOpen.value = false;
        await loadUsers();
        ElMessage.success("用户积分已调整");
    }
    catch (error) {
        ElMessage.error(messageOf(error, "积分调整失败"));
    }
    finally {
        saving.value = false;
    }
}
function accountLabel(accountId) {
    return `ID：${String(accountId).padStart(4, "0")}`;
}
function roleLabel(role) {
    return role === "admin" ? "管理员" : "普通用户";
}
function statusLabel(status) {
    return status === "active" ? "正常" : "已停用";
}
function formatDate(value) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function formatPoints(value) {
    return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
function messageOf(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(summary, {});
// @ts-ignore
__VLS_withDotValue(loading, {});
// @ts-ignore
__VLS_withDotValue(users, {});
// @ts-ignore
__VLS_withDotValue(editingAccountId, {});
// @ts-ignore
__VLS_withDotValue(form, {});
// @ts-ignore
__VLS_withDotValue(editingUser, {});
// @ts-ignore
__VLS_withDotValue(editorOpen, {});
// @ts-ignore
__VLS_withDotValue(passwordUser, {});
// @ts-ignore
__VLS_withDotValue(passwordOpen, {});
// @ts-ignore
__VLS_withDotValue(pointsUser, {});
// @ts-ignore
__VLS_withDotValue(pointsOpen, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "users-workspace" },
});
/** @type {__VLS_StyleScopedClasses['users-workspace']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-metrics" },
});
/** @type {__VLS_StyleScopedClasses['user-metrics']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.total);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.active);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.admins);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.disabled);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(formatPoints(summary.value.totalPoints));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['user-toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (submitSearch) },
    ...{ class: "user-search" },
});
/** @type {__VLS_StyleScopedClasses['user-search']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.Search} */
Search;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    size: (16),
}));
const __VLS_2 = __VLS_1({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    placeholder: "搜索邮箱、用户名或账号 ID",
});
(__VLS_unwrap(searchDraft, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    type: "submit",
});
let __VLS_5;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    ...{ 'onChange': {} }, modelValue: (__VLS_unwrap(roleFilter, {})), 'aria-label': "角色筛选", placeholder: "全部角色",
}));
const __VLS_7 = __VLS_6({
    ...{ 'onChange': {} },
    modelValue: (__VLS_unwrap(roleFilter, {})),
    'aria-label': "角色筛选",
    placeholder: "全部角色",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_10;
const __VLS_11 = {
    /** @type {typeof __VLS_10.change} */
    onChange: (applyFilters),
};
void __VLS_11;
const { default: __VLS_12 } = __VLS_nonNull(__VLS_8.slots);
let __VLS_13;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
    // @ts-ignore
    label: "全部角色", value: "",
}));
const __VLS_15 = __VLS_14({
    label: "全部角色",
    value: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
let __VLS_18;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
    // @ts-ignore
    label: "普通用户", value: "user",
}));
const __VLS_20 = __VLS_19({
    label: "普通用户",
    value: "user",
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
let __VLS_23;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
    // @ts-ignore
    label: "管理员", value: "admin",
}));
const __VLS_25 = __VLS_24({
    label: "管理员",
    value: "admin",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
// @ts-ignore
[summary, summary, summary, summary, summary, searchDraft, roleFilter,];
var __VLS_8;
var __VLS_9;
let __VLS_28;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
    // @ts-ignore
    ...{ 'onChange': {} }, modelValue: (__VLS_unwrap(statusFilter, {})), 'aria-label': "状态筛选", placeholder: "全部状态",
}));
const __VLS_30 = __VLS_29({
    ...{ 'onChange': {} },
    modelValue: (__VLS_unwrap(statusFilter, {})),
    'aria-label': "状态筛选",
    placeholder: "全部状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_33;
const __VLS_34 = {
    /** @type {typeof __VLS_33.change} */
    onChange: (applyFilters),
};
void __VLS_34;
const { default: __VLS_35 } = __VLS_nonNull(__VLS_31.slots);
let __VLS_36;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
    // @ts-ignore
    label: "全部状态", value: "",
}));
const __VLS_38 = __VLS_37({
    label: "全部状态",
    value: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_41;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
    // @ts-ignore
    label: "正常", value: "active",
}));
const __VLS_43 = __VLS_42({
    label: "正常",
    value: "active",
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
let __VLS_46;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
    // @ts-ignore
    label: "已停用", value: "disabled",
}));
const __VLS_48 = __VLS_47({
    label: "已停用",
    value: "disabled",
}, ...__VLS_functionalComponentArgsRest(__VLS_47));
// @ts-ignore
[statusFilter,];
var __VLS_31;
var __VLS_32;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (openCreate) },
    ...{ class: "user-primary" },
    type: "button",
});
/** @type {__VLS_StyleScopedClasses['user-primary']} */ ;
let __VLS_51;
/** @ts-ignore @type { | typeof __VLS_components.UserPlus} */
UserPlus;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
    // @ts-ignore
    size: (16),
}));
const __VLS_53 = __VLS_52({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['user-loading']} */ ;
    let __VLS_56;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
        // @ts-ignore
        ...{ class: "spin" }, size: (22),
    }));
    const __VLS_58 = __VLS_57({
        ...{ class: "spin" },
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else if (users.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['user-table-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "user-table" },
    });
    /** @type {__VLS_StyleScopedClasses['user-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_61 = __VLS_tryAsConstant((users.value));
    for (const [user] of __VLS_vFor(__VLS_nonNull(__VLS_61))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (user.accountId),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-identity" },
        });
        /** @type {__VLS_StyleScopedClasses['user-identity']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
        (user.username.charAt(0).toUpperCase());
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (user.username);
        if (user.isSelf) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (accountLabel(user.accountId));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-email" },
        });
        /** @type {__VLS_StyleScopedClasses['user-email']} */ ;
        (user.email);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-role" },
            ...{ class: ({ 'is-admin': user.role === 'admin' }) },
        });
        /** @type {__VLS_StyleScopedClasses['user-role']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-admin']} */ ;
        if (user.role === 'admin') {
            let __VLS_62;
            /** @ts-ignore @type { | typeof __VLS_components.ShieldCheck} */
            ShieldCheck;
            // @ts-ignore
            const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
                // @ts-ignore
                size: (13),
            }));
            const __VLS_64 = __VLS_63({
                size: (13),
            }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        }
        else {
            let __VLS_67;
            /** @ts-ignore @type { | typeof __VLS_components.UserRound} */
            UserRound;
            // @ts-ignore
            const __VLS_68 = __VLS_asFunctionalComponent1(__VLS_67, new __VLS_67({
                // @ts-ignore
                size: (13),
            }));
            const __VLS_69 = __VLS_68({
                size: (13),
            }, ...__VLS_functionalComponentArgsRest(__VLS_68));
        }
        (roleLabel(user.role));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-status" },
            ...{ class: ({ 'is-disabled': user.status === 'disabled' }) },
        });
        /** @type {__VLS_StyleScopedClasses['user-status']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
        (statusLabel(user.status));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
            ...{ class: "user-points" },
        });
        /** @type {__VLS_StyleScopedClasses['user-points']} */ ;
        let __VLS_72;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent1(__VLS_72, new __VLS_72({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_74 = __VLS_73({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        (formatPoints(user.pointsBalance));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (formatDate(user.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "user-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['user-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(users.value.length))
                        throw 0;
                    return (openPoints(user));
                    // @ts-ignore
                    [loading, users, users,];
                } },
            type: "button",
            'aria-label': (`调整 ${user.username} 积分`),
        });
        let __VLS_77;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_78 = __VLS_asFunctionalComponent1(__VLS_77, new __VLS_77({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_79 = __VLS_78({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_78));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(users.value.length))
                        throw 0;
                    return (openEdit(user));
                    // @ts-ignore
                    [];
                } },
            type: "button",
            'aria-label': (`编辑 ${user.username}`),
        });
        let __VLS_82;
        /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
        Pencil;
        // @ts-ignore
        const __VLS_83 = __VLS_asFunctionalComponent1(__VLS_82, new __VLS_82({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_84 = __VLS_83({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_83));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(users.value.length))
                        throw 0;
                    return (openPassword(user));
                    // @ts-ignore
                    [];
                } },
            type: "button",
            'aria-label': (`重置 ${user.username} 密码`),
        });
        let __VLS_87;
        /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
        KeyRound;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_89 = __VLS_88({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        // @ts-ignore
        [];
    }
}
if (!loading.value && users.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-mobile-list" },
    });
    /** @type {__VLS_StyleScopedClasses['user-mobile-list']} */ ;
    const __VLS_92 = __VLS_tryAsConstant((users.value));
    for (const [user] of __VLS_vFor(__VLS_nonNull(__VLS_92))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
            key: (user.accountId),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "user-mobile-head" },
        });
        /** @type {__VLS_StyleScopedClasses['user-mobile-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-identity" },
        });
        /** @type {__VLS_StyleScopedClasses['user-identity']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
        (user.username.charAt(0).toUpperCase());
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (user.username);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (accountLabel(user.accountId));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "user-status" },
            ...{ class: ({ 'is-disabled': user.status === 'disabled' }) },
        });
        /** @type {__VLS_StyleScopedClasses['user-status']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
        (statusLabel(user.status));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (user.email);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "user-mobile-meta" },
        });
        /** @type {__VLS_StyleScopedClasses['user-mobile-meta']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (roleLabel(user.role));
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        let __VLS_93;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_94 = __VLS_asFunctionalComponent1(__VLS_93, new __VLS_93({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_95 = __VLS_94({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_94));
        (formatPoints(user.pointsBalance));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (formatDate(user.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "user-mobile-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['user-mobile-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && users.value.length))
                        throw 0;
                    return (openPoints(user));
                    // @ts-ignore
                    [loading, users, users,];
                } },
            type: "button",
        });
        let __VLS_98;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_99 = __VLS_asFunctionalComponent1(__VLS_98, new __VLS_98({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_100 = __VLS_99({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_99));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && users.value.length))
                        throw 0;
                    return (openEdit(user));
                    // @ts-ignore
                    [];
                } },
            type: "button",
        });
        let __VLS_103;
        /** @ts-ignore @type { | typeof __VLS_components.Pencil} */
        Pencil;
        // @ts-ignore
        const __VLS_104 = __VLS_asFunctionalComponent1(__VLS_103, new __VLS_103({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_105 = __VLS_104({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_104));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && users.value.length))
                        throw 0;
                    return (openPassword(user));
                    // @ts-ignore
                    [];
                } },
            type: "button",
        });
        let __VLS_108;
        /** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
        KeyRound;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent1(__VLS_108, new __VLS_108({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_110 = __VLS_109({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        // @ts-ignore
        [];
    }
}
if (!loading.value && !users.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['user-empty']} */ ;
    let __VLS_113;
    /** @ts-ignore @type { | typeof __VLS_components.UsersRound} */
    UsersRound;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent1(__VLS_113, new __VLS_113({
        // @ts-ignore
        size: (30),
    }));
    const __VLS_115 = __VLS_114({
        size: (30),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
    ...{ class: "user-pagination" },
});
/** @type {__VLS_StyleScopedClasses['user-pagination']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_unwrap(total, {}));
let __VLS_118;
/** @ts-ignore @type { | typeof __VLS_components.ElPagination} */
ElPagination;
// @ts-ignore
const __VLS_119 = __VLS_asFunctionalComponent1(__VLS_118, new __VLS_118({
    // @ts-ignore
    ...{ 'onCurrentChange': {} }, background: true, layout: "prev, pager, next", currentPage: (__VLS_unwrap(page, {})), pageSize: (__VLS_unwrap(pageSize, {})), total: (__VLS_unwrap(total, {})),
}));
const __VLS_120 = __VLS_119({
    ...{ 'onCurrentChange': {} },
    background: true,
    layout: "prev, pager, next",
    currentPage: (__VLS_unwrap(page, {})),
    pageSize: (__VLS_unwrap(pageSize, {})),
    total: (__VLS_unwrap(total, {})),
}, ...__VLS_functionalComponentArgsRest(__VLS_119));
let __VLS_123;
const __VLS_124 = {
    /** @type {typeof __VLS_123.currentChange} */
    onCurrentChange: (changePage),
};
void __VLS_124;
var __VLS_121;
var __VLS_122;
let __VLS_125;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_126 = __VLS_asFunctionalComponent1(__VLS_125, new __VLS_125({
    // @ts-ignore
    ...{ 'onChange': {} }, modelValue: (__VLS_unwrap(pageSize, {})), 'aria-label': "每页数量",
}));
const __VLS_127 = __VLS_126({
    ...{ 'onChange': {} },
    modelValue: (__VLS_unwrap(pageSize, {})),
    'aria-label': "每页数量",
}, ...__VLS_functionalComponentArgsRest(__VLS_126));
let __VLS_130;
const __VLS_131 = {
    /** @type {typeof __VLS_130.change} */
    onChange: (changePageSize),
};
void __VLS_131;
const { default: __VLS_132 } = __VLS_nonNull(__VLS_128.slots);
let __VLS_133;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_134 = __VLS_asFunctionalComponent1(__VLS_133, new __VLS_133({
    // @ts-ignore
    label: "20 条/页", value: (20),
}));
const __VLS_135 = __VLS_134({
    label: "20 条/页",
    value: (20),
}, ...__VLS_functionalComponentArgsRest(__VLS_134));
let __VLS_138;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_139 = __VLS_asFunctionalComponent1(__VLS_138, new __VLS_138({
    // @ts-ignore
    label: "50 条/页", value: (50),
}));
const __VLS_140 = __VLS_139({
    label: "50 条/页",
    value: (50),
}, ...__VLS_functionalComponentArgsRest(__VLS_139));
// @ts-ignore
[loading, users, total, total, page, pageSize, pageSize,];
var __VLS_128;
var __VLS_129;
let __VLS_143;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_144 = __VLS_asFunctionalComponent1(__VLS_143, new __VLS_143({
    // @ts-ignore
    modelValue: (editorOpen.value), title: (editingAccountId.value ? `编辑用户 · ${accountLabel(editingAccountId.value)}` : '创建用户'), width: "min(620px, calc(100vw - 28px))", destroyOnClose: true,
}));
const __VLS_145 = __VLS_144({
    modelValue: (editorOpen.value),
    title: (editingAccountId.value ? `编辑用户 · ${accountLabel(editingAccountId.value)}` : '创建用户'),
    width: "min(620px, calc(100vw - 28px))",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_144));
const { default: __VLS_148 } = __VLS_nonNull(__VLS_146.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-form-grid" },
});
/** @type {__VLS_StyleScopedClasses['user-form-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_149;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_150 = __VLS_asFunctionalComponent1(__VLS_149, new __VLS_149({
    // @ts-ignore
    modelValue: (form.value.username), maxlength: "32",
}));
const __VLS_151 = __VLS_150({
    modelValue: (form.value.username),
    maxlength: "32",
}, ...__VLS_functionalComponentArgsRest(__VLS_150));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_154;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_155 = __VLS_asFunctionalComponent1(__VLS_154, new __VLS_154({
    // @ts-ignore
    modelValue: (form.value.email), type: "email",
}));
const __VLS_156 = __VLS_155({
    modelValue: (form.value.email),
    type: "email",
}, ...__VLS_functionalComponentArgsRest(__VLS_155));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_159;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_160 = __VLS_asFunctionalComponent1(__VLS_159, new __VLS_159({
    // @ts-ignore
    modelValue: (form.value.role), disabled: (editingUser.value?.isSelf),
}));
const __VLS_161 = __VLS_160({
    modelValue: (form.value.role),
    disabled: (editingUser.value?.isSelf),
}, ...__VLS_functionalComponentArgsRest(__VLS_160));
const { default: __VLS_164 } = __VLS_nonNull(__VLS_162.slots);
let __VLS_165;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent1(__VLS_165, new __VLS_165({
    // @ts-ignore
    label: "普通用户", value: "user",
}));
const __VLS_167 = __VLS_166({
    label: "普通用户",
    value: "user",
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
let __VLS_170;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent1(__VLS_170, new __VLS_170({
    // @ts-ignore
    label: "管理员", value: "admin",
}));
const __VLS_172 = __VLS_171({
    label: "管理员",
    value: "admin",
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
// @ts-ignore
[editorOpen, editingAccountId, editingAccountId, form, form, form, editingUser,];
var __VLS_162;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_175;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_176 = __VLS_asFunctionalComponent1(__VLS_175, new __VLS_175({
    // @ts-ignore
    modelValue: (form.value.status), disabled: (editingUser.value?.isSelf),
}));
const __VLS_177 = __VLS_176({
    modelValue: (form.value.status),
    disabled: (editingUser.value?.isSelf),
}, ...__VLS_functionalComponentArgsRest(__VLS_176));
const { default: __VLS_180 } = __VLS_nonNull(__VLS_178.slots);
let __VLS_181;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_182 = __VLS_asFunctionalComponent1(__VLS_181, new __VLS_181({
    // @ts-ignore
    label: "正常", value: "active",
}));
const __VLS_183 = __VLS_182({
    label: "正常",
    value: "active",
}, ...__VLS_functionalComponentArgsRest(__VLS_182));
let __VLS_186;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent1(__VLS_186, new __VLS_186({
    // @ts-ignore
    label: "已停用", value: "disabled",
}));
const __VLS_188 = __VLS_187({
    label: "已停用",
    value: "disabled",
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
// @ts-ignore
[form, editingUser,];
var __VLS_178;
if (!editingAccountId.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "user-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['user-form-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_191;
    /** @ts-ignore @type { | typeof __VLS_components.ElInput} */
    ElInput;
    // @ts-ignore
    const __VLS_192 = __VLS_asFunctionalComponent1(__VLS_191, new __VLS_191({
        // @ts-ignore
        modelValue: (form.value.password), type: "password", showPassword: true, minlength: "8", maxlength: "72", placeholder: "至少 8 位",
    }));
    const __VLS_193 = __VLS_192({
        modelValue: (form.value.password),
        type: "password",
        showPassword: true,
        minlength: "8",
        maxlength: "72",
        placeholder: "至少 8 位",
    }, ...__VLS_functionalComponentArgsRest(__VLS_192));
}
if (editingUser.value?.isSelf) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-self-note user-form-wide" },
    });
    /** @type {__VLS_StyleScopedClasses['user-self-note']} */ ;
    /** @type {__VLS_StyleScopedClasses['user-form-wide']} */ ;
    let __VLS_196;
    /** @ts-ignore @type { | typeof __VLS_components.ShieldCheck} */
    ShieldCheck;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent1(__VLS_196, new __VLS_196({
        // @ts-ignore
        size: (16),
    }));
    const __VLS_198 = __VLS_197({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
}
{
    const { footer: __VLS_201 } = __VLS_nonNull(__VLS_146.slots);
    let __VLS_202;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_203 = __VLS_asFunctionalComponent1(__VLS_202, new __VLS_202({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_204 = __VLS_203({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_203));
    let __VLS_207;
    const __VLS_208 = {
        /** @type {typeof __VLS_207.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (editorOpen.value = false);
            // @ts-ignore
            [editorOpen, editingAccountId, form, editingUser,];
        },
    };
    void __VLS_208;
    const { default: __VLS_209 } = __VLS_nonNull(__VLS_205.slots);
    // @ts-ignore
    [];
    var __VLS_205;
    var __VLS_206;
    let __VLS_210;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_211 = __VLS_asFunctionalComponent1(__VLS_210, new __VLS_210({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_212 = __VLS_211({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_211));
    let __VLS_215;
    const __VLS_216 = {
        /** @type {typeof __VLS_215.click} */
        onClick: (saveUser),
    };
    void __VLS_216;
    const { default: __VLS_217 } = __VLS_nonNull(__VLS_213.slots);
    // @ts-ignore
    [saving,];
    var __VLS_213;
    var __VLS_214;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_146;
let __VLS_218;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent1(__VLS_218, new __VLS_218({
    // @ts-ignore
    modelValue: (passwordOpen.value), title: (`重置密码 · ${passwordUser.value ? accountLabel(passwordUser.value.accountId) : ''}`), width: "min(480px, calc(100vw - 28px))", appendToBody: true,
}));
const __VLS_220 = __VLS_219({
    modelValue: (passwordOpen.value),
    title: (`重置密码 · ${passwordUser.value ? accountLabel(passwordUser.value.accountId) : ''}`),
    width: "min(480px, calc(100vw - 28px))",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
const { default: __VLS_223 } = __VLS_nonNull(__VLS_221.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-password-panel" },
});
/** @type {__VLS_StyleScopedClasses['user-password-panel']} */ ;
let __VLS_224;
/** @ts-ignore @type { | typeof __VLS_components.KeyRound} */
KeyRound;
// @ts-ignore
const __VLS_225 = __VLS_asFunctionalComponent1(__VLS_224, new __VLS_224({
    // @ts-ignore
    size: (22),
}));
const __VLS_226 = __VLS_225({
    size: (22),
}, ...__VLS_functionalComponentArgsRest(__VLS_225));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(passwordUser.value?.username);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_229;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_230 = __VLS_asFunctionalComponent1(__VLS_229, new __VLS_229({
    // @ts-ignore
    ...{ 'onKeyup': {} }, modelValue: (__VLS_unwrap(password, {})), type: "password", showPassword: true, minlength: "8", maxlength: "72", placeholder: "输入至少 8 位新密码",
}));
const __VLS_231 = __VLS_230({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_unwrap(password, {})),
    type: "password",
    showPassword: true,
    minlength: "8",
    maxlength: "72",
    placeholder: "输入至少 8 位新密码",
}, ...__VLS_functionalComponentArgsRest(__VLS_230));
let __VLS_234;
const __VLS_235 = {
    /** @type {typeof __VLS_234.keyup} */
    onKeyup: (resetPassword),
};
void __VLS_235;
var __VLS_232;
var __VLS_233;
{
    const { footer: __VLS_236 } = __VLS_nonNull(__VLS_221.slots);
    let __VLS_237;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_238 = __VLS_asFunctionalComponent1(__VLS_237, new __VLS_237({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_239 = __VLS_238({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_238));
    let __VLS_242;
    const __VLS_243 = {
        /** @type {typeof __VLS_242.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (passwordOpen.value = false);
            // @ts-ignore
            [passwordOpen, passwordOpen, passwordUser, passwordUser, passwordUser, password,];
        },
    };
    void __VLS_243;
    const { default: __VLS_244 } = __VLS_nonNull(__VLS_240.slots);
    // @ts-ignore
    [];
    var __VLS_240;
    var __VLS_241;
    let __VLS_245;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_246 = __VLS_asFunctionalComponent1(__VLS_245, new __VLS_245({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_247 = __VLS_246({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_246));
    let __VLS_250;
    const __VLS_251 = {
        /** @type {typeof __VLS_250.click} */
        onClick: (resetPassword),
    };
    void __VLS_251;
    const { default: __VLS_252 } = __VLS_nonNull(__VLS_248.slots);
    // @ts-ignore
    [saving,];
    var __VLS_248;
    var __VLS_249;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_221;
let __VLS_253;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_254 = __VLS_asFunctionalComponent1(__VLS_253, new __VLS_253({
    // @ts-ignore
    modelValue: (pointsOpen.value), title: (`调整积分 · ${pointsUser.value ? accountLabel(pointsUser.value.accountId) : ''}`), width: "min(500px, calc(100vw - 28px))", appendToBody: true,
}));
const __VLS_255 = __VLS_254({
    modelValue: (pointsOpen.value),
    title: (`调整积分 · ${pointsUser.value ? accountLabel(pointsUser.value.accountId) : ''}`),
    width: "min(500px, calc(100vw - 28px))",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_254));
const { default: __VLS_258 } = __VLS_nonNull(__VLS_256.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-points-balance" },
});
/** @type {__VLS_StyleScopedClasses['user-points-balance']} */ ;
let __VLS_259;
/** @ts-ignore @type { | typeof __VLS_components.Coins} */
Coins;
// @ts-ignore
const __VLS_260 = __VLS_asFunctionalComponent1(__VLS_259, new __VLS_259({
    // @ts-ignore
    size: (22),
}));
const __VLS_261 = __VLS_260({
    size: (22),
}, ...__VLS_functionalComponentArgsRest(__VLS_260));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(formatPoints(pointsUser.value?.pointsBalance || 0));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-form-grid" },
});
/** @type {__VLS_StyleScopedClasses['user-form-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_264;
/** @ts-ignore @type { | typeof __VLS_components.ElInputNumber} */
ElInputNumber;
// @ts-ignore
const __VLS_265 = __VLS_asFunctionalComponent1(__VLS_264, new __VLS_264({
    // @ts-ignore
    modelValue: (__VLS_unwrap(pointsAmount, {})), min: (-1000000), max: (1000000), precision: (2), placeholder: "正数增加，负数扣除",
}));
const __VLS_266 = __VLS_265({
    modelValue: (__VLS_unwrap(pointsAmount, {})),
    min: (-1000000),
    max: (1000000),
    precision: (2),
    placeholder: "正数增加，负数扣除",
}, ...__VLS_functionalComponentArgsRest(__VLS_265));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "user-form-wide" },
});
/** @type {__VLS_StyleScopedClasses['user-form-wide']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
let __VLS_269;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_270 = __VLS_asFunctionalComponent1(__VLS_269, new __VLS_269({
    // @ts-ignore
    modelValue: (__VLS_unwrap(pointsDescription, {})), maxlength: "200", placeholder: "例如：活动赠送 / 人工退款 / 违规扣除",
}));
const __VLS_271 = __VLS_270({
    modelValue: (__VLS_unwrap(pointsDescription, {})),
    maxlength: "200",
    placeholder: "例如：活动赠送 / 人工退款 / 违规扣除",
}, ...__VLS_functionalComponentArgsRest(__VLS_270));
{
    const { footer: __VLS_274 } = __VLS_nonNull(__VLS_256.slots);
    let __VLS_275;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_276 = __VLS_asFunctionalComponent1(__VLS_275, new __VLS_275({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_277 = __VLS_276({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_276));
    let __VLS_280;
    const __VLS_281 = {
        /** @type {typeof __VLS_280.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (pointsOpen.value = false);
            // @ts-ignore
            [pointsOpen, pointsOpen, pointsUser, pointsUser, pointsUser, pointsAmount, pointsDescription,];
        },
    };
    void __VLS_281;
    const { default: __VLS_282 } = __VLS_nonNull(__VLS_278.slots);
    // @ts-ignore
    [];
    var __VLS_278;
    var __VLS_279;
    let __VLS_283;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_284 = __VLS_asFunctionalComponent1(__VLS_283, new __VLS_283({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (__VLS_unwrap(saving, {})),
    }));
    const __VLS_285 = __VLS_284({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_unwrap(saving, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_284));
    let __VLS_288;
    const __VLS_289 = {
        /** @type {typeof __VLS_288.click} */
        onClick: (adjustPoints),
    };
    void __VLS_289;
    const { default: __VLS_290 } = __VLS_nonNull(__VLS_286.slots);
    // @ts-ignore
    [saving,];
    var __VLS_286;
    var __VLS_287;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_256;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
