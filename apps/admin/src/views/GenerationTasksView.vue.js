import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElButton, ElDialog, ElDrawer, ElInput, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect } from "element-plus";
import "element-plus/dist/index.css";
import { Ban, CircleAlert, Clock3, Coins, Eye, Image, LoaderCircle, RefreshCcw, RotateCcw, Search, Video } from "@lucide/vue";
import * as generationApi from "@/services/generations";
const tasks = ref([]);
const summary = ref({ total: 0, queued: 0, running: 0, needsReview: 0, succeeded: 0, failed: 0, cancelled: 0, pointsSpent: 0 });
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
const reviewOpen = ref(false);
const reviewAction = ref("confirm_failed");
const reviewValue = ref("");
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
async function checkReviewTask(task) { actingTaskId.value = task.taskId; try {
    selectedTask.value = await generationApi.checkGeneration(task.taskId);
    await loadTasks();
    ElMessage.info(selectedTask.value.status === "succeeded" ? "任务已完成" : "上游仍在处理中");
}
catch (error) {
    ElMessage.error(messageOf(error, "状态检查失败"));
}
finally {
    actingTaskId.value = "";
} }
function openReview(task) { selectedTask.value = task; reviewAction.value = "confirm_failed"; reviewValue.value = ""; reviewOpen.value = true; }
async function submitReview() { if (!selectedTask.value)
    return; actingTaskId.value = selectedTask.value.taskId; try {
    selectedTask.value = await generationApi.reviewGeneration(selectedTask.value.taskId, reviewAction.value === "provide_result" ? { action: "provide_result", resultUrl: reviewValue.value.trim() } : { action: "confirm_failed", reason: reviewValue.value.trim() });
    reviewOpen.value = false;
    await loadTasks();
    ElMessage.success("任务已处理");
}
catch (error) {
    ElMessage.error(messageOf(error, "任务处理失败"));
}
finally {
    actingTaskId.value = "";
} }
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
function statusLabel(status) { return ({ queued: "排队中", running: "生成中", needs_review: "待确认", succeeded: "已完成", failed: "失败", cancelled: "已取消" })[status]; }
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
// @ts-ignore
__VLS_withDotValue(reviewAction, {});
// @ts-ignore
__VLS_withDotValue(reviewOpen, {});
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
(summary.value.needsReview);
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
    label: "待确认", value: "needs_review",
}));
const __VLS_30 = __VLS_29({
    label: "待确认",
    value: "needs_review",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_33;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
    // @ts-ignore
    label: "已完成", value: "succeeded",
}));
const __VLS_35 = __VLS_34({
    label: "已完成",
    value: "succeeded",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
let __VLS_38;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
    // @ts-ignore
    label: "失败", value: "failed",
}));
const __VLS_40 = __VLS_39({
    label: "失败",
    value: "failed",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
let __VLS_43;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
    // @ts-ignore
    label: "已取消", value: "cancelled",
}));
const __VLS_45 = __VLS_44({
    label: "已取消",
    value: "cancelled",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
// @ts-ignore
[summary, summary, summary, summary, summary, summary, summary, successRate, searchDraft, statusFilter,];
var __VLS_8;
var __VLS_9;
let __VLS_48;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
    // @ts-ignore
    ...{ 'onChange': {} }, modelValue: (__VLS_unwrap(kindFilter, {})), 'aria-label': "类型筛选", placeholder: "全部类型",
}));
const __VLS_50 = __VLS_49({
    ...{ 'onChange': {} },
    modelValue: (__VLS_unwrap(kindFilter, {})),
    'aria-label': "类型筛选",
    placeholder: "全部类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_53;
const __VLS_54 = {
    /** @type {typeof __VLS_53.change} */
    onChange: (applyFilters),
};
void __VLS_54;
const { default: __VLS_55 } = __VLS_nonNull(__VLS_51.slots);
let __VLS_56;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
    // @ts-ignore
    label: "全部类型", value: "",
}));
const __VLS_58 = __VLS_57({
    label: "全部类型",
    value: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_61;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_62 = __VLS_asFunctionalComponent1(__VLS_61, new __VLS_61({
    // @ts-ignore
    label: "图片", value: "image",
}));
const __VLS_63 = __VLS_62({
    label: "图片",
    value: "image",
}, ...__VLS_functionalComponentArgsRest(__VLS_62));
let __VLS_66;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({
    // @ts-ignore
    label: "视频", value: "video",
}));
const __VLS_68 = __VLS_67({
    label: "视频",
    value: "video",
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
// @ts-ignore
[kindFilter,];
var __VLS_51;
var __VLS_52;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (loadTasks) },
    ...{ class: "generation-refresh" },
    type: "button",
    disabled: (loading.value),
});
/** @type {__VLS_StyleScopedClasses['generation-refresh']} */ ;
let __VLS_71;
/** @ts-ignore @type { | typeof __VLS_components.RefreshCcw} */
RefreshCcw;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent1(__VLS_71, new __VLS_71({
    // @ts-ignore
    ...{ class: ({ spin: loading.value }) }, size: (16),
}));
const __VLS_73 = __VLS_72({
    ...{ class: ({ spin: loading.value }) },
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-loading']} */ ;
    let __VLS_76;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent1(__VLS_76, new __VLS_76({
        // @ts-ignore
        ...{ class: "spin" }, size: (22),
    }));
    const __VLS_78 = __VLS_77({
        ...{ class: "spin" },
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
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
    const __VLS_81 = __VLS_tryAsConstant((tasks.value));
    for (const [task] of __VLS_vFor(__VLS_nonNull(__VLS_81))) {
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
            const __VLS_82 = (task.type === 'image' ? __VLS_unwrap(Image, {}) : __VLS_unwrap(Video, {}));
            // @ts-ignore
            const __VLS_83 = __VLS_asFunctionalComponent1(__VLS_82, new __VLS_82({
                // @ts-ignore
                size: (16),
            }));
            const __VLS_84 = __VLS_83({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_83));
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
        let __VLS_87;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_89 = __VLS_88({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
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
        let __VLS_92;
        /** @ts-ignore @type { | typeof __VLS_components.Eye} */
        Eye;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent1(__VLS_92, new __VLS_92({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_94 = __VLS_93({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        if (task.status === 'needs_review' && task.upstreamTaskId) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(tasks.value.length))
                            throw 0;
                        if (!(task.status === 'needs_review' && task.upstreamTaskId))
                            throw 0;
                        return (checkReviewTask(task));
                        // @ts-ignore
                        [];
                    } },
                type: "button",
                title: "检查上游状态",
                disabled: (actingTaskId.value === task.taskId),
            });
            let __VLS_97;
            /** @ts-ignore @type { | typeof __VLS_components.RefreshCcw} */
            RefreshCcw;
            // @ts-ignore
            const __VLS_98 = __VLS_asFunctionalComponent1(__VLS_97, new __VLS_97({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_99 = __VLS_98({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_98));
        }
        if (task.status === 'needs_review') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(tasks.value.length))
                            throw 0;
                        if (!(task.status === 'needs_review'))
                            throw 0;
                        return (openReview(task));
                        // @ts-ignore
                        [actingTaskId,];
                    } },
                type: "button",
                title: "人工接管",
            });
            let __VLS_102;
            /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_103 = __VLS_asFunctionalComponent1(__VLS_102, new __VLS_102({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_104 = __VLS_103({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_103));
        }
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
            let __VLS_107;
            /** @ts-ignore @type { | typeof __VLS_components.RotateCcw} */
            RotateCcw;
            // @ts-ignore
            const __VLS_108 = __VLS_asFunctionalComponent1(__VLS_107, new __VLS_107({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_109 = __VLS_108({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_108));
        }
        if (task.status === 'queued' || (task.status === 'running' && task.upstreamTaskId)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: // @ts-ignore
                    (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!(tasks.value.length))
                            throw 0;
                        if (!(task.status === 'queued' || (task.status === 'running' && task.upstreamTaskId)))
                            throw 0;
                        return (runAction(task, 'cancel'));
                        // @ts-ignore
                        [actingTaskId,];
                    } },
                type: "button",
                title: "取消任务",
                disabled: (actingTaskId.value === task.taskId),
            });
            let __VLS_112;
            /** @ts-ignore @type { | typeof __VLS_components.Ban} */
            Ban;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent1(__VLS_112, new __VLS_112({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_114 = __VLS_113({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
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
            let __VLS_117;
            /** @ts-ignore @type { | typeof __VLS_components.Coins} */
            Coins;
            // @ts-ignore
            const __VLS_118 = __VLS_asFunctionalComponent1(__VLS_117, new __VLS_117({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_119 = __VLS_118({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_118));
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
    const __VLS_122 = __VLS_tryAsConstant((tasks.value));
    for (const [task] of __VLS_vFor(__VLS_nonNull(__VLS_122))) {
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
            const __VLS_123 = (task.type === 'image' ? __VLS_unwrap(Image, {}) : __VLS_unwrap(Video, {}));
            // @ts-ignore
            const __VLS_124 = __VLS_asFunctionalComponent1(__VLS_123, new __VLS_123({
                // @ts-ignore
                size: (16),
            }));
            const __VLS_125 = __VLS_124({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_124));
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
        let __VLS_128;
        /** @ts-ignore @type { | typeof __VLS_components.Eye} */
        Eye;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent1(__VLS_128, new __VLS_128({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_130 = __VLS_129({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        // @ts-ignore
        [];
    }
}
if (!loading.value && !tasks.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-empty']} */ ;
    let __VLS_133;
    /** @ts-ignore @type { | typeof __VLS_components.Clock3} */
    Clock3;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent1(__VLS_133, new __VLS_133({
        // @ts-ignore
        size: (30),
    }));
    const __VLS_135 = __VLS_134({
        size: (30),
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
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
    let __VLS_138;
    /** @ts-ignore @type { | typeof __VLS_components.ElPagination} */
    ElPagination;
    // @ts-ignore
    const __VLS_139 = __VLS_asFunctionalComponent1(__VLS_138, new __VLS_138({
        // @ts-ignore
        ...{ 'onCurrentChange': {} }, background: true, layout: "prev, pager, next", currentPage: (page.value), pageSize: (pageSize.value), total: (total.value),
    }));
    const __VLS_140 = __VLS_139({
        ...{ 'onCurrentChange': {} },
        background: true,
        layout: "prev, pager, next",
        currentPage: (page.value),
        pageSize: (pageSize.value),
        total: (total.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_139));
    let __VLS_143;
    const __VLS_144 = {
        /** @type {typeof __VLS_143.currentChange} */
        onCurrentChange: ((value) => { page.value = value; loadTasks(); }),
    };
    void __VLS_144;
    var __VLS_141;
    var __VLS_142;
    let __VLS_145;
    /** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
    ElSelect;
    // @ts-ignore
    const __VLS_146 = __VLS_asFunctionalComponent1(__VLS_145, new __VLS_145({
        // @ts-ignore
        ...{ 'onChange': {} }, modelValue: (pageSize.value), 'aria-label': "每页数量",
    }));
    const __VLS_147 = __VLS_146({
        ...{ 'onChange': {} },
        modelValue: (pageSize.value),
        'aria-label': "每页数量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_146));
    let __VLS_150;
    const __VLS_151 = {
        /** @type {typeof __VLS_150.change} */
        onChange: ((value) => { pageSize.value = value; page.value = 1; loadTasks(); }),
    };
    void __VLS_151;
    const { default: __VLS_152 } = __VLS_nonNull(__VLS_148.slots);
    let __VLS_153;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent1(__VLS_153, new __VLS_153({
        // @ts-ignore
        label: "20 条/页", value: (20),
    }));
    const __VLS_155 = __VLS_154({
        label: "20 条/页",
        value: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    let __VLS_158;
    /** @ts-ignore @type { | typeof __VLS_components.ElOption} */
    ElOption;
    // @ts-ignore
    const __VLS_159 = __VLS_asFunctionalComponent1(__VLS_158, new __VLS_158({
        // @ts-ignore
        label: "50 条/页", value: (50),
    }));
    const __VLS_160 = __VLS_159({
        label: "50 条/页",
        value: (50),
    }, ...__VLS_functionalComponentArgsRest(__VLS_159));
    // @ts-ignore
    [loading, tasks, total, total, total, page, page, page, pageSize, pageSize, pageSize,];
    var __VLS_148;
    var __VLS_149;
}
let __VLS_163;
/** @ts-ignore @type { | typeof __VLS_components.ElDrawer | typeof __VLS_components.ElDrawer} */
ElDrawer;
// @ts-ignore
const __VLS_164 = __VLS_asFunctionalComponent1(__VLS_163, new __VLS_163({
    // @ts-ignore
    modelValue: (__VLS_unwrap(detailOpen, {})), title: "任务详情", size: "min(560px, 100vw)", appendToBody: true,
}));
const __VLS_165 = __VLS_164({
    modelValue: (__VLS_unwrap(detailOpen, {})),
    title: "任务详情",
    size: "min(560px, 100vw)",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_164));
const { default: __VLS_168 } = __VLS_nonNull(__VLS_166.slots);
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
        let __VLS_169;
        /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
        CircleAlert;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent1(__VLS_169, new __VLS_169({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_171 = __VLS_170({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (selectedTask.value.errorMessage);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    if (selectedTask.value.attempts?.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "generation-attempts" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-attempts']} */ ;
        const __VLS_174 = __VLS_tryAsConstant((selectedTask.value.attempts));
        for (const [attempt] of __VLS_vFor(__VLS_nonNull(__VLS_174))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
                key: (attempt.attemptNo),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ class: (`is-${attempt.status}`) },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (attempt.attemptNo);
            (attempt.channelName || '渠道已删除');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (attempt.protocol);
            (attempt.requestPath || '-');
            (attempt.httpStatus || '-');
            (attempt.durationMs ?? '-');
            if (attempt.errorMessage) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
                (attempt.errorMessage);
            }
            // @ts-ignore
            [detailOpen, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "generation-detail-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['generation-detail-actions']} */ ;
    if (selectedTask.value.status === 'needs_review' && selectedTask.value.upstreamTaskId) {
        let __VLS_175;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_176 = __VLS_asFunctionalComponent1(__VLS_175, new __VLS_175({
            // @ts-ignore
            ...{ 'onClick': {} }, loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_177 = __VLS_176({
            ...{ 'onClick': {} },
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_176));
        let __VLS_180;
        const __VLS_181 = {
            /** @type {typeof __VLS_180.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'needs_review' && selectedTask.value.upstreamTaskId))
                    throw 0;
                return (checkReviewTask(selectedTask.value));
                // @ts-ignore
                [actingTaskId, selectedTask, selectedTask, selectedTask, selectedTask,];
            },
        };
        void __VLS_181;
        const { default: __VLS_182 } = __VLS_nonNull(__VLS_178.slots);
        let __VLS_183;
        /** @ts-ignore @type { | typeof __VLS_components.RefreshCcw} */
        RefreshCcw;
        // @ts-ignore
        const __VLS_184 = __VLS_asFunctionalComponent1(__VLS_183, new __VLS_183({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_185 = __VLS_184({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_184));
        // @ts-ignore
        [];
        var __VLS_178;
        var __VLS_179;
    }
    if (selectedTask.value.status === 'needs_review') {
        let __VLS_188;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_189 = __VLS_asFunctionalComponent1(__VLS_188, new __VLS_188({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "warning",
        }));
        const __VLS_190 = __VLS_189({
            ...{ 'onClick': {} },
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_189));
        let __VLS_193;
        const __VLS_194 = {
            /** @type {typeof __VLS_193.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'needs_review'))
                    throw 0;
                return (openReview(selectedTask.value));
                // @ts-ignore
                [selectedTask, selectedTask,];
            },
        };
        void __VLS_194;
        const { default: __VLS_195 } = __VLS_nonNull(__VLS_191.slots);
        let __VLS_196;
        /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
        CircleAlert;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent1(__VLS_196, new __VLS_196({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_198 = __VLS_197({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        // @ts-ignore
        [];
        var __VLS_191;
        var __VLS_192;
    }
    if (selectedTask.value.status === 'failed' || selectedTask.value.status === 'cancelled') {
        let __VLS_201;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_202 = __VLS_asFunctionalComponent1(__VLS_201, new __VLS_201({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "primary", loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_203 = __VLS_202({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_202));
        let __VLS_206;
        const __VLS_207 = {
            /** @type {typeof __VLS_206.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'failed' || selectedTask.value.status === 'cancelled'))
                    throw 0;
                return (runAction(selectedTask.value, 'retry'));
                // @ts-ignore
                [actingTaskId, selectedTask, selectedTask, selectedTask, selectedTask,];
            },
        };
        void __VLS_207;
        const { default: __VLS_208 } = __VLS_nonNull(__VLS_204.slots);
        let __VLS_209;
        /** @ts-ignore @type { | typeof __VLS_components.RotateCcw} */
        RotateCcw;
        // @ts-ignore
        const __VLS_210 = __VLS_asFunctionalComponent1(__VLS_209, new __VLS_209({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_211 = __VLS_210({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_210));
        // @ts-ignore
        [];
        var __VLS_204;
        var __VLS_205;
    }
    if (selectedTask.value.status === 'queued' || (selectedTask.value.status === 'running' && selectedTask.value.upstreamTaskId)) {
        let __VLS_214;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_215 = __VLS_asFunctionalComponent1(__VLS_214, new __VLS_214({
            // @ts-ignore
            ...{ 'onClick': {} }, type: "danger", plain: true, loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_216 = __VLS_215({
            ...{ 'onClick': {} },
            type: "danger",
            plain: true,
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_215));
        let __VLS_219;
        const __VLS_220 = {
            /** @type {typeof __VLS_219.click} */
            onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedTask.value))
                    throw 0;
                if (!(selectedTask.value.status === 'queued' || (selectedTask.value.status === 'running' && selectedTask.value.upstreamTaskId)))
                    throw 0;
                return (runAction(selectedTask.value, 'cancel'));
                // @ts-ignore
                [actingTaskId, selectedTask, selectedTask, selectedTask, selectedTask, selectedTask,];
            },
        };
        void __VLS_220;
        const { default: __VLS_221 } = __VLS_nonNull(__VLS_217.slots);
        let __VLS_222;
        /** @ts-ignore @type { | typeof __VLS_components.Ban} */
        Ban;
        // @ts-ignore
        const __VLS_223 = __VLS_asFunctionalComponent1(__VLS_222, new __VLS_222({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_224 = __VLS_223({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_223));
        // @ts-ignore
        [];
        var __VLS_217;
        var __VLS_218;
    }
    if (selectedTask.value.status === 'succeeded' && !selectedTask.value.pointsRefunded && selectedTask.value.pointsCost > 0) {
        let __VLS_227;
        /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
        ElButton;
        // @ts-ignore
        const __VLS_228 = __VLS_asFunctionalComponent1(__VLS_227, new __VLS_227({
            // @ts-ignore
            ...{ 'onClick': {} }, loading: (actingTaskId.value === selectedTask.value.taskId),
        }));
        const __VLS_229 = __VLS_228({
            ...{ 'onClick': {} },
            loading: (actingTaskId.value === selectedTask.value.taskId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_228));
        let __VLS_232;
        const __VLS_233 = {
            /** @type {typeof __VLS_232.click} */
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
        void __VLS_233;
        const { default: __VLS_234 } = __VLS_nonNull(__VLS_230.slots);
        let __VLS_235;
        /** @ts-ignore @type { | typeof __VLS_components.Coins} */
        Coins;
        // @ts-ignore
        const __VLS_236 = __VLS_asFunctionalComponent1(__VLS_235, new __VLS_235({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_237 = __VLS_236({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_236));
        // @ts-ignore
        [];
        var __VLS_230;
        var __VLS_231;
    }
}
// @ts-ignore
[];
var __VLS_166;
let __VLS_240;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent1(__VLS_240, new __VLS_240({
    // @ts-ignore
    modelValue: (__VLS_unwrap(imagePreviewOpen, {})), ...{ class: "generation-image-preview" }, title: (previewTask.value ? `图片预览 · ${shortTask(previewTask.value.taskId)}` : '图片预览'), width: "min(920px, calc(100vw - 28px))", appendToBody: true, destroyOnClose: true,
}));
const __VLS_242 = __VLS_241({
    modelValue: (__VLS_unwrap(imagePreviewOpen, {})),
    ...{ class: "generation-image-preview" },
    title: (previewTask.value ? `图片预览 · ${shortTask(previewTask.value.taskId)}` : '图片预览'),
    width: "min(920px, calc(100vw - 28px))",
    appendToBody: true,
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
/** @type {__VLS_StyleScopedClasses['generation-image-preview']} */ ;
const { default: __VLS_245 } = __VLS_nonNull(__VLS_243.slots);
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
var __VLS_243;
let __VLS_246;
/** @ts-ignore @type { | typeof __VLS_components.ElDialog | typeof __VLS_components.ElDialog} */
ElDialog;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent1(__VLS_246, new __VLS_246({
    // @ts-ignore
    modelValue: (reviewOpen.value), title: "人工接管待确认任务", width: "min(560px, calc(100vw - 28px))", appendToBody: true,
}));
const __VLS_248 = __VLS_247({
    modelValue: (reviewOpen.value),
    title: "人工接管待确认任务",
    width: "min(560px, calc(100vw - 28px))",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
const { default: __VLS_251 } = __VLS_nonNull(__VLS_249.slots);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "generation-review-form" },
});
/** @type {__VLS_StyleScopedClasses['generation-review-form']} */ ;
let __VLS_252;
/** @ts-ignore @type { | typeof __VLS_components.ElSelect | typeof __VLS_components.ElSelect} */
ElSelect;
// @ts-ignore
const __VLS_253 = __VLS_asFunctionalComponent1(__VLS_252, new __VLS_252({
    // @ts-ignore
    modelValue: (reviewAction.value),
}));
const __VLS_254 = __VLS_253({
    modelValue: (reviewAction.value),
}, ...__VLS_functionalComponentArgsRest(__VLS_253));
const { default: __VLS_257 } = __VLS_nonNull(__VLS_255.slots);
let __VLS_258;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_259 = __VLS_asFunctionalComponent1(__VLS_258, new __VLS_258({
    // @ts-ignore
    label: "确认失败并退款", value: "confirm_failed",
}));
const __VLS_260 = __VLS_259({
    label: "确认失败并退款",
    value: "confirm_failed",
}, ...__VLS_functionalComponentArgsRest(__VLS_259));
let __VLS_263;
/** @ts-ignore @type { | typeof __VLS_components.ElOption} */
ElOption;
// @ts-ignore
const __VLS_264 = __VLS_asFunctionalComponent1(__VLS_263, new __VLS_263({
    // @ts-ignore
    label: "提供结果地址", value: "provide_result",
}));
const __VLS_265 = __VLS_264({
    label: "提供结果地址",
    value: "provide_result",
}, ...__VLS_functionalComponentArgsRest(__VLS_264));
// @ts-ignore
[reviewOpen, reviewAction,];
var __VLS_255;
let __VLS_268;
/** @ts-ignore @type { | typeof __VLS_components.ElInput} */
ElInput;
// @ts-ignore
const __VLS_269 = __VLS_asFunctionalComponent1(__VLS_268, new __VLS_268({
    // @ts-ignore
    modelValue: (__VLS_unwrap(reviewValue, {})), placeholder: (reviewAction.value === 'provide_result' ? '输入 HTTPS 图片结果地址' : '填写公开失败原因（可选）'),
}));
const __VLS_270 = __VLS_269({
    modelValue: (__VLS_unwrap(reviewValue, {})),
    placeholder: (reviewAction.value === 'provide_result' ? '输入 HTTPS 图片结果地址' : '填写公开失败原因（可选）'),
}, ...__VLS_functionalComponentArgsRest(__VLS_269));
{
    const { footer: __VLS_273 } = __VLS_nonNull(__VLS_249.slots);
    let __VLS_274;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_275 = __VLS_asFunctionalComponent1(__VLS_274, new __VLS_274({
        // @ts-ignore
        ...{ 'onClick': {} },
    }));
    const __VLS_276 = __VLS_275({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_275));
    let __VLS_279;
    const __VLS_280 = {
        /** @type {typeof __VLS_279.click} */
        onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (reviewOpen.value = false);
            // @ts-ignore
            [reviewOpen, reviewAction, reviewValue,];
        },
    };
    void __VLS_280;
    const { default: __VLS_281 } = __VLS_nonNull(__VLS_277.slots);
    // @ts-ignore
    [];
    var __VLS_277;
    var __VLS_278;
    let __VLS_282;
    /** @ts-ignore @type { | typeof __VLS_components.ElButton | typeof __VLS_components.ElButton} */
    ElButton;
    // @ts-ignore
    const __VLS_283 = __VLS_asFunctionalComponent1(__VLS_282, new __VLS_282({
        // @ts-ignore
        ...{ 'onClick': {} }, type: "primary", loading: (Boolean(actingTaskId.value)),
    }));
    const __VLS_284 = __VLS_283({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (Boolean(actingTaskId.value)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_283));
    let __VLS_287;
    const __VLS_288 = {
        /** @type {typeof __VLS_287.click} */
        onClick: (submitReview),
    };
    void __VLS_288;
    const { default: __VLS_289 } = __VLS_nonNull(__VLS_285.slots);
    // @ts-ignore
    [actingTaskId,];
    var __VLS_285;
    var __VLS_286;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_249;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
