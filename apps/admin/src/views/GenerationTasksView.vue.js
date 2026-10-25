import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElButton, ElDialog, ElDrawer, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect } from "element-plus";
import "element-plus/dist/index.css";
import { Ban, CircleAlert, Clock3, Coins, Eye, Image, LoaderCircle, RefreshCcw, RotateCcw, Search, Video } from "@lucide/vue";
import * as generationApi from "@/services/generations";
const tasks = ref([]);
const summary = ref({ total: 0, queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, pointsSpent: 0 });
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const searchDraft = ref("");
const search = ref("");
const statusFilter = ref("");
const kindFilter = ref("");
const loading = ref(true);
const actingTaskId = ref("");
const detailOpen = ref(false);
const selectedTask = ref(null);
const imagePreviewOpen = ref(false);
const previewTask = ref(null);
const previewUrls = ref({});
const previewSignatures = ref({});
let loadSequence = 0;
const successRate = computed(() => summary.value.total ? Math.round(summary.value.succeeded / summary.value.total * 100) : 0);
const previewImageUrl = computed(() => previewTask.value ? previewUrls.value[previewTask.value.taskId] || "" : "");
onMounted(() => void loadTasks());
onBeforeUnmount(() => revokePreviews());
async function loadTasks() {
    const sequence = ++loadSequence;
    loading.value = true;
    try {
        const result = await generationApi.listGenerations({
            page: page.value, pageSize: pageSize.value, search: search.value,
            status: statusFilter.value || undefined, type: kindFilter.value || undefined,
        });
        if (sequence !== loadSequence)
            return;
        tasks.value = result.items;
        total.value = result.total;
        summary.value = result.summary;
        void loadPreviews(result.items, sequence);
    }
    catch (error) {
        if (sequence === loadSequence)
            ElMessage.error(messageOf(error, "任务加载失败"));
    }
    finally {
        if (sequence === loadSequence)
            loading.value = false;
    }
}
async function loadPreviews(items, sequence) {
    const currentUrls = previewUrls.value;
    const currentSignatures = previewSignatures.value;
    const entries = await Promise.all(items.map(async (task) => {
        const signature = `${task.status}:${task.assetId}`;
        if (task.status !== "succeeded" || task.type !== "image")
            return { id: task.taskId, url: "", signature, created: false };
        if (currentUrls[task.taskId] && currentSignatures[task.taskId] === signature)
            return { id: task.taskId, url: currentUrls[task.taskId], signature, created: false };
        try {
            const blob = await generationApi.getGenerationPreview(task.taskId);
            return { id: task.taskId, url: URL.createObjectURL(blob), signature, created: true };
        }
        catch {
            return { id: task.taskId, url: "", signature: "", created: false };
        }
    }));
    if (sequence !== loadSequence) {
        entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url));
        return;
    }
    const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]));
    const nextSignatures = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]));
    Object.entries(currentUrls).forEach(([id, url]) => {
        if (url && nextUrls[id] !== url)
            URL.revokeObjectURL(url);
    });
    previewUrls.value = nextUrls;
    previewSignatures.value = nextSignatures;
}
function revokePreviews() {
    Object.values(previewUrls.value).forEach((url) => url && URL.revokeObjectURL(url));
    previewUrls.value = {};
    previewSignatures.value = {};
}
function submitSearch() {
    search.value = searchDraft.value.trim();
    page.value = 1;
    void loadTasks();
}
function applyFilters() {
    page.value = 1;
    void loadTasks();
}
async function openDetail(task) {
    selectedTask.value = task;
    detailOpen.value = true;
    try {
        selectedTask.value = await generationApi.getGeneration(task.taskId);
    }
    catch (error) {
        ElMessage.error(messageOf(error, "任务详情加载失败"));
    }
}
function openImagePreview(task) {
    if (!previewUrls.value[task.taskId])
        return;
    previewTask.value = task;
    imagePreviewOpen.value = true;
}
async function runAction(task, action) {
    const labels = { retry: ["重新排队", "确认重试该失败任务？若此前已退款，将重新扣除本次生成积分。"], cancel: ["取消任务", "确认取消该排队任务并退回已扣积分？"], refund: ["补退积分", "确认向该用户退回本任务消耗的积分？此操作只能执行一次。"] };
    try {
        await ElMessageBox.confirm(labels[action][1], labels[action][0], { confirmButtonText: "确认", cancelButtonText: "返回", type: action === "cancel" ? "warning" : "info" });
    }
    catch {
        return;
    }
    actingTaskId.value = task.taskId;
    try {
        const result = action === "retry" ? await generationApi.retryGeneration(task.taskId) : action === "cancel" ? await generationApi.cancelGeneration(task.taskId) : await generationApi.refundGeneration(task.taskId);
        selectedTask.value = result.task;
        await loadTasks();
        ElMessage.success(labels[action][0] + "成功");
    }
    catch (error) {
        ElMessage.error(messageOf(error, `${labels[action][0]}失败`));
    }
    finally {
        actingTaskId.value = "";
    }
}
function accountLabel(value) { return `ID：${String(value).padStart(4, "0")}`; }
function shortTask(value) { return value.slice(0, 8).toUpperCase(); }
function formatPoints(value) { return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }); }
function formatDate(value) { return value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "-"; }
function duration(task) {
    if (!task.startedAt)
        return "-";
    const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
    const seconds = Math.max(0, Math.round((end - new Date(task.startedAt).getTime()) / 1000));
    return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)}分 ${seconds % 60}秒`;
}
function statusLabel(status) { return ({ queued: "排队中", running: "生成中", succeeded: "已完成", failed: "失败", cancelled: "已取消" })[status]; }
function kindLabel(kind) { return kind === "image" ? "图片" : "视频"; }
function messageOf(error, fallback) { return error instanceof Error && error.message ? error.message : fallback; }
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
__VLS_withDotValue(tasks, {});
// @ts-ignore
__VLS_withDotValue(previewUrls, {});
// @ts-ignore
__VLS_withDotValue(actingTaskId, {});
// @ts-ignore
__VLS_withDotValue(total, {});
// @ts-ignore
__VLS_withDotValue(page, {});
// @ts-ignore
__VLS_withDotValue(pageSize, {});
// @ts-ignore
__VLS_withDotValue(selectedTask, {});
// @ts-ignore
__VLS_withDotValue(previewTask, {});
// @ts-ignore
__VLS_withDotValue(previewImageUrl, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "generation-workspace" },
});
/** @type {__VLS_StyleScopedClasses['generation-workspace']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "generation-metrics" },
});
/** @type {__VLS_StyleScopedClasses['generation-metrics']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.total);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.queued + summary.value.running);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(__VLS_unwrap(successRate, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(summary.value.failed + summary.value.cancelled);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(formatPoints(summary.value.pointsSpent));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "generation-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['generation-toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (submitSearch) },
    ...{ class: "generation-search" },
});
/** @type {__VLS_StyleScopedClasses['generation-search']} */ ;
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
    placeholder: "任务 ID、用户、账号 ID、模型或渠道",
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
    ...{ 'onChange': {} }, modelValue: (__VLS_unwrap(statusFilter, {})), 'aria-label': "状态筛选", placeholder: "全部状态",
}));
const __VLS_7 = __VLS_6({
    ...{ 'onChange': {} },
    modelValue: (__VLS_unwrap(statusFilter, {})),
    'aria-label': "状态筛选",
    placeholder: "全部状态",
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
    label: "全部状态", value: "",
}));
const __VLS_15 = __VLS_14({
    label: "全部状态",
    value: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
let __VLS_18;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
    // @ts-ignore
    label: "排队中", value: "queued",
}));
const __VLS_20 = __VLS_19({
    label: "排队中",
    value: "queued",
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
let __VLS_23;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
    // @ts-ignore
    label: "生成中", value: "running",
}));
const __VLS_25 = __VLS_24({
    label: "生成中",
    value: "running",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
let __VLS_28;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
    // @ts-ignore
    label: "已完成", value: "succeeded",
}));
const __VLS_30 = __VLS_29({
    label: "已完成",
    value: "succeeded",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_33;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
    // @ts-ignore
    label: "失败", value: "failed",
}));
const __VLS_35 = __VLS_34({
    label: "失败",
    value: "failed",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
let __VLS_38;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
    // @ts-ignore
    label: "已取消", value: "cancelled",
}));
const __VLS_40 = __VLS_39({
    label: "已取消",
    value: "cancelled",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
// @ts-ignore
[summary, summary, summary, summary, summary, summary, successRate, searchDraft, statusFilter,];
var __VLS_8;
var __VLS_9;
let __VLS_43;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
    // @ts-ignore
    ...{ 'onChange': {} }, modelValue: (__VLS_unwrap(kindFilter, {})), 'aria-label': "类型筛选", placeholder: "全部类型",
}));
const __VLS_45 = __VLS_44({
    ...{ 'onChange': {} },
    modelValue: (__VLS_unwrap(kindFilter, {})),
    'aria-label': "类型筛选",
    placeholder: "全部类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
let __VLS_48;
const __VLS_49 = {
    /** @type {typeof __VLS_48.change} */
    onChange: (applyFilters),
};
void __VLS_49;
const { default: __VLS_50 } = __VLS_nonNull(__VLS_46.slots);
let __VLS_51;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
    // @ts-ignore
    label: "全部类型", value: "",
}));
const __VLS_53 = __VLS_52({
    label: "全部类型",
    value: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
let __VLS_56;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
    // @ts-ignore
    label: "图片", value: "image",
}));
const __VLS_58 = __VLS_57({
    label: "图片",
    value: "image",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_61;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_62 = __VLS_asFunctionalComponent1(__VLS_61, new __VLS_61({
    // @ts-ignore
    label: "视频", value: "video",
}));
const __VLS_63 = __VLS_62({
    label: "视频",
    value: "video",
}, ...__VLS_functionalComponentArgsRest(__VLS_62));
// @ts-ignore
[kindFilter,];
var __VLS_46;
var __VLS_47;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (loadTasks) },
    ...{ class: "generation-refresh" },
    type: "button",
    disabled: (loading.value),
});
/** @type {__VLS_StyleScopedClasses['generation-refresh']} */ ;
let __VLS_66;
/** @ts-ignore @type { | typeof __VLS_components.RefreshCcw} */
RefreshCcw;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({
    // @ts-ignore
    ...{ class: ({ spin: loading.value }) }, size: (16),
}));
const __VLS_68 = __VLS_67({
    ...{ class: ({ spin: loading.value }) },
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-loading']} */ ;
    let __VLS_71;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent1(__VLS_71, new __VLS_71({
        // @ts-ignore
        ...{ class: "spin" }, size: (22),
    }));
    const __VLS_73 = __VLS_72({
        ...{ class: "spin" },
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else if (tasks.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-table-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "generation-table" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-table']} */ ;
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
    const __VLS_76 = __VLS_tryAsConstant((tasks.value));
    for (const [task] of __VLS_vFor(__VLS_nonNull(__VLS_76))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (task.taskId),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-task-id" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-task-id']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(tasks.value.length))
                        throw 0;
                    return (openImagePreview(task));
                    // @ts-ignore
                    [loading, loading, loading, tasks, tasks,];
                } },
            ...{ class: "generation-task-thumb" },
            type: "button",
            disabled: (!previewUrls.value[task.taskId]),
            title: (previewUrls.value[task.taskId] ? '查看生成图片' : undefined),
        });
        /** @type {__VLS_StyleScopedClasses['generation-task-thumb']} */ ;
        if (previewUrls.value[task.taskId]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (previewUrls.value[task.taskId]),
                alt: (task.prompt),
            });
        }
        else {
            const __VLS_77 = (task.type === 'image' ? __VLS_unwrap(Image, {}) : __VLS_unwrap(Video, {}));
            // @ts-ignore
            const __VLS_78 = __VLS_asFunctionalComponent1(__VLS_77, new __VLS_77({
                // @ts-ignore
                size: (16),
            }));
            const __VLS_79 = __VLS_78({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_78));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (shortTask(task.taskId));
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (kindLabel(task.type));
        (task.retryCount);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-user" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-user']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (task.username);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (accountLabel(task.accountId));
        (task.email);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-channel" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-channel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (task.channelName || "渠道已删除");
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (task.model);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (task.size || "-");
        (task.quality || "-");
        if (task.referenceCount) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (task.referenceCount);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-status" },
            ...{ class: (`is-${task.status}`) },
        });
        /** @type {__VLS_StyleScopedClasses['generation-status']} */ ;
        (statusLabel(task.status));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-cost" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-cost']} */ ;
        let __VLS_82;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_83 = __VLS_asFunctionalComponent1(__VLS_82, new __VLS_82({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_84 = __VLS_83({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_83));
        (formatPoints(task.pointsCost));
        if (task.pointsRefunded) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (formatDate(task.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (duration(task));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "generation-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(tasks.value.length))
                        throw 0;
                    return (openDetail(task));
                    // @ts-ignore
                    [previewUrls, previewUrls, previewUrls, previewUrls, Image, Video,];
                } },
            type: "button",
            title: "查看详情",
        });
        let __VLS_87;
        /** @ts-ignore @type { | typeof __VLS_components.Eye} */
        Eye;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_89 = __VLS_88({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        if (task.status === 'failed' || task.status === 'cancelled') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(tasks.value.length))
                            throw 0;
                        if (!(task.status === 'failed' || task.status === 'cancelled'))
                            throw 0;
                        return (runAction(task, 'retry'));
                        // @ts-ignore
                        [];
                    } },
                type: "button",
                title: "重试任务",
                disabled: (actingTaskId.value === task.taskId),
            });
            let __VLS_92;
            /** @ts-ignore @type { | typeof __VLS_components.RotateCcw} */
            RotateCcw;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent1(__VLS_92, new __VLS_92({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_94 = __VLS_93({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        }
        if (task.status === 'queued') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(tasks.value.length))
                            throw 0;
                        if (!(task.status === 'queued'))
                            throw 0;
                        return (runAction(task, 'cancel'));
                        // @ts-ignore
                        [actingTaskId,];
                    } },
                type: "button",
                title: "取消任务",
                disabled: (actingTaskId.value === task.taskId),
            });
            let __VLS_97;
            /** @ts-ignore @type { | typeof __VLS_components.Ban} */
            Ban;
            // @ts-ignore
            const __VLS_98 = __VLS_asFunctionalComponent1(__VLS_97, new __VLS_97({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_99 = __VLS_98({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_98));
        }
        if (task.status === 'succeeded' && !task.pointsRefunded && task.pointsCost > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(tasks.value.length))
                            throw 0;
                        if (!(task.status === 'succeeded' && !task.pointsRefunded && task.pointsCost > 0))
                            throw 0;
                        return (runAction(task, 'refund'));
                        // @ts-ignore
                        [actingTaskId,];
                    } },
                type: "button",
                title: "补退积分",
                disabled: (actingTaskId.value === task.taskId),
            });
            let __VLS_102;
            /** @ts-ignore @type { | typeof __VLS_components.Coins} */
            Coins;
            // @ts-ignore
            const __VLS_103 = __VLS_asFunctionalComponent1(__VLS_102, new __VLS_102({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_104 = __VLS_103({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_103));
        }
        // @ts-ignore
        [actingTaskId,];
    }
}
if (!loading.value && tasks.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-mobile-list" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-mobile-list']} */ ;
    const __VLS_107 = __VLS_tryAsConstant((tasks.value));
    for (const [task] of __VLS_vFor(__VLS_nonNull(__VLS_107))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
            key: (task.taskId),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-task-id" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-task-id']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && tasks.value.length))
                        throw 0;
                    return (openImagePreview(task));
                    // @ts-ignore
                    [loading, tasks, tasks,];
                } },
            ...{ class: "generation-task-thumb" },
            type: "button",
            disabled: (!previewUrls.value[task.taskId]),
            title: (previewUrls.value[task.taskId] ? '查看生成图片' : undefined),
        });
        /** @type {__VLS_StyleScopedClasses['generation-task-thumb']} */ ;
        if (previewUrls.value[task.taskId]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (previewUrls.value[task.taskId]),
                alt: (task.prompt),
            });
        }
        else {
            const __VLS_108 = (task.type === 'image' ? __VLS_unwrap(Image, {}) : __VLS_unwrap(Video, {}));
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent1(__VLS_108, new __VLS_108({
                // @ts-ignore
                size: (16),
            }));
            const __VLS_110 = __VLS_109({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (shortTask(task.taskId));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "generation-status" },
            ...{ class: (`is-${task.status}`) },
        });
        /** @type {__VLS_StyleScopedClasses['generation-status']} */ ;
        (statusLabel(task.status));
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (task.username);
        (accountLabel(task.accountId));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (task.channelName || "渠道已删除");
        (task.model);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (task.size || "-");
        (task.quality || "-");
        (formatPoints(task.pointsCost));
        (formatDate(task.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!(!loading.value && tasks.value.length))
                        throw 0;
                    return (openDetail(task));
                    // @ts-ignore
                    [previewUrls, previewUrls, previewUrls, previewUrls, Image, Video,];
                } },
            type: "button",
        });
        let __VLS_113;
        /** @ts-ignore @type { | typeof __VLS_components.Eye} */
        Eye;
        // @ts-ignore
        const __VLS_114 = __VLS_asFunctionalComponent1(__VLS_113, new __VLS_113({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_115 = __VLS_114({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_114));
        // @ts-ignore
        [];
    }
}
if (!loading.value && !tasks.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-empty']} */ ;
    let __VLS_118;
    /** @ts-ignore @type { | typeof __VLS_components.Clock3} */
    Clock3;
    // @ts-ignore
    const __VLS_119 = __VLS_asFunctionalComponent1(__VLS_118, new __VLS_118({
        // @ts-ignore
        size: (30),
    }));
    const __VLS_120 = __VLS_119({
        size: (30),
    }, ...__VLS_functionalComponentArgsRest(__VLS_119));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
if (total.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
        ...{ class: "generation-pagination" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-pagination']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (total.value);
    let __VLS_123;
    /** @ts-ignore @type { | typeof __VLS_components.ElPagination} */
    ElPagination;
    // @ts-ignore
    const __VLS_124 = __VLS_asFunctionalComponent1(__VLS_123, new __VLS_123({
        // @ts-ignore
        ...{ 'onCurrentChange': {} }, background: true, layout: "prev, pager, next", currentPage: (page.value), pageSize: (pageSize.value), total: (total.value),
    }));
    const __VLS_125 = __VLS_124({
        ...{ 'onCurrentChange': {} },
        background: true,
        layout: "prev, pager, next",
        currentPage: (page.value),
        pageSize: (pageSize.value),
        total: (total.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_124));
    let __VLS_128;
    const __VLS_129 = {
        /** @type {typeof __VLS_128.currentChange} */
        onCurrentChange: ((value) => { page.value = value; loadTasks(); }),
    };
    void __VLS_129;
    var __VLS_126;
    var __VLS_127;
    let __VLS_130;
    /** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
    ElSelect;
    // @ts-ignore
    const __VLS_131 = __VLS_asFunctionalComponent1(__VLS_130, new __VLS_130({
        // @ts-ignore
        ...{ 'onChange': {} }, modelValue: (pageSize.value), 'aria-label': "每页数量",
    }));
    const __VLS_132 = __VLS_131({
        ...{ 'onChange': {} },
        modelValue: (pageSize.value),
        'aria-label': "每页数量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_131));
    let __VLS_135;
    const __VLS_136 = {
        /** @type {typeof __VLS_135.change} */
        onChange: ((value) => { pageSize.value = value; page.value = 1; loadTasks(); }),
    };
    void __VLS_136;
    const { default: __VLS_137 } = __VLS_nonNull(__VLS_133.slots);
    let __VLS_138;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_139 = __VLS_asFunctionalComponent1(__VLS_138, new __VLS_138({
        // @ts-ignore
        label: "20 条/页", value: (20),
    }));
    const __VLS_140 = __VLS_139({
        label: "20 条/页",
        value: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_139));
    let __VLS_143;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_144 = __VLS_asFunctionalComponent1(__VLS_143, new __VLS_143({
        // @ts-ignore
        label: "50 条/页", value: (50),
    }));
    const __VLS_145 = __VLS_144({
        label: "50 条/页",
        value: (50),
    }, ...__VLS_functionalComponentArgsRest(__VLS_144));
    // @ts-ignore
    [loading, tasks, total, total, total, page, page, page, pageSize, pageSize, pageSize,];
    var __VLS_133;
    var __VLS_134;
}
let __VLS_148;
/** @ts-ignore @type { | typeof __VLS_components.ElDrawer | typeof __VLS_components.ElDrawer} */
ElDrawer;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent1(__VLS_148, new __VLS_148({
    // @ts-ignore
    modelValue: (__VLS_unwrap(detailOpen, {})), title: "任务详情", size: "min(560px, 100vw)", appendToBody: true,
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_unwrap(detailOpen, {})),
    title: "任务详情",
    size: "min(560px, 100vw)",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
const { default: __VLS_153 } = __VLS_nonNull(__VLS_151.slots);
if (selectedTask.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-detail" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-detail']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-detail-head" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-detail-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "generation-status" },
        ...{ class: (`is-${selectedTask.value.status}`) },
    });
    /** @type {__VLS_StyleScopedClasses['generation-status']} */ ;
    (statusLabel(selectedTask.value.status));
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    (selectedTask.value.taskId);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (selectedTask.value.username);
    (accountLabel(selectedTask.value.accountId));
    __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
    (selectedTask.value.email);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (selectedTask.value.channelName || "渠道已删除");
    (selectedTask.value.channelProtocol || "-");
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (selectedTask.value.model);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (selectedTask.value.size || "-");
    (selectedTask.value.quality || "-");
    (selectedTask.value.width);
    (selectedTask.value.height);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (selectedTask.value.referenceCount);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "generation-prompt" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-prompt']} */ ;
    (selectedTask.value.prompt);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (formatPoints(selectedTask.value.pointsCost));
    (selectedTask.value.pointsRefunded ? " · 已退款" : "");
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (formatDate(selectedTask.value.createdAt));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (formatDate(selectedTask.value.startedAt));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (formatDate(selectedTask.value.completedAt));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
    (duration(selectedTask.value));
    if (selectedTask.value.errorMessage) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "generation-error" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-error']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        let __VLS_154;
        /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
        CircleAlert;
        // @ts-ignore
        const __VLS_155 = __VLS_asFunctionalComponent1(__VLS_154, new __VLS_154({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_156 = __VLS_155({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_155));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (selectedTask.value.errorMessage);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-detail-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-detail-actions']} */ ;
    if (selectedTask.value.status === 'failed' || selectedTask.value.status === 'cancelled') {
        let __VLS_159;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_160 = __VLS_asFunctionalComponent1(__VLS_159, new __VLS_159({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "primary", loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_161 = __VLS_160({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_160));
        let __VLS_164;
        const __VLS_165 = {
            /** @type {typeof __VLS_164.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'failed' || selectedTask.value.status === 'cancelled'))
                    throw 0;
                return (runAction(selectedTask.value, 'retry'));
                // @ts-ignore
                [actingTaskId, detailOpen, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask,];
            },
        };
        void __VLS_165;
        const { default: __VLS_166 } = __VLS_nonNull(__VLS_162.slots);
        let __VLS_167;
        /** @ts-ignore @type { | typeof __VLS_components.RotateCcw} */
        RotateCcw;
        // @ts-ignore
        const __VLS_168 = __VLS_asFunctionalComponent1(__VLS_167, new __VLS_167({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_169 = __VLS_168({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_168));
        // @ts-ignore
        [];
        var __VLS_162;
        var __VLS_163;
    }
    if (selectedTask.value.status === 'queued') {
        let __VLS_172;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent1(__VLS_172, new __VLS_172({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "danger", plain: true, loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_174 = __VLS_173({
            ...{ 'onClick': {} },
            type: "danger",
            plain: true,
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        let __VLS_177;
        const __VLS_178 = {
            /** @type {typeof __VLS_177.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'queued'))
                    throw 0;
                return (runAction(selectedTask.value, 'cancel'));
                // @ts-ignore
                [actingTaskId, selectedTask, selectedTask, selectedTask,];
            },
        };
        void __VLS_178;
        const { default: __VLS_179 } = __VLS_nonNull(__VLS_175.slots);
        let __VLS_180;
        /** @ts-ignore @type { | typeof __VLS_components.Ban} */
        Ban;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent1(__VLS_180, new __VLS_180({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_182 = __VLS_181({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        // @ts-ignore
        [];
        var __VLS_175;
        var __VLS_176;
    }
    if (selectedTask.value.status === 'succeeded' && !selectedTask.value.pointsRefunded && selectedTask.value.pointsCost > 0) {
        let __VLS_185;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_186 = __VLS_asFunctionalComponent1(__VLS_185, new __VLS_185({
            // @ts-ignore
            ...{ 'onClick': {} }, loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_187 = __VLS_186({
            ...{ 'onClick': {} },
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_186));
        let __VLS_190;
        const __VLS_191 = {
            /** @type {typeof __VLS_190.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'succeeded' && !selectedTask.value.pointsRefunded && selectedTask.value.pointsCost > 0))
                    throw 0;
                return (runAction(selectedTask.value, 'refund'));
                // @ts-ignore
                [actingTaskId, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask,];
            },
        };
        void __VLS_191;
        const { default: __VLS_192 } = __VLS_nonNull(__VLS_188.slots);
        let __VLS_193;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_194 = __VLS_asFunctionalComponent1(__VLS_193, new __VLS_193({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_195 = __VLS_194({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_194));
        // @ts-ignore
        [];
        var __VLS_188;
        var __VLS_189;
    }
}
// @ts-ignore
[];
var __VLS_151;
let __VLS_198;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent1(__VLS_198, new __VLS_198({
    // @ts-ignore
    modelValue: (__VLS_unwrap(imagePreviewOpen, {})), ...{ class: "generation-image-preview" }, title: (previewTask.value ? `图片预览 · ${shortTask(previewTask.value.taskId)}` : '图片预览'), width: "min(920px, calc(100vw - 28px))", appendToBody: true, destroyOnClose: true,
}));
const __VLS_200 = __VLS_199({
    modelValue: (__VLS_unwrap(imagePreviewOpen, {})),
    ...{ class: "generation-image-preview" },
    title: (previewTask.value ? `图片预览 · ${shortTask(previewTask.value.taskId)}` : '图片预览'),
    width: "min(920px, calc(100vw - 28px))",
    appendToBody: true,
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
/** @type {__VLS_StyleScopedClasses['generation-image-preview']} */ ;
const { default: __VLS_203 } = __VLS_nonNull(__VLS_201.slots);
if (previewTask.value && previewImageUrl.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-image-preview__body" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-image-preview__body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
        src: (previewImageUrl.value),
        alt: (previewTask.value.prompt),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (previewTask.value.username);
    (accountLabel(previewTask.value.accountId));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (previewTask.value.model);
    (previewTask.value.width);
    (previewTask.value.height);
}
// @ts-ignore
[imagePreviewOpen, previewTask, previewTask, previewTask, previewTask, previewTask, previewTask, previewTask, previewTask, previewTask, previewImageUrl, previewImageUrl,];
var __VLS_201;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
