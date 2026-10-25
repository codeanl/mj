import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Download, Image, LoaderCircle, Music, Video, X } from "@lucide/vue";
import * as assetApi from "@/services/assets";
import { apiErrorMessage } from "@/services/http";
import { notification } from "@/services/notifications";
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const downloading = ref(false);
const referencePreviewUrls = ref({});
const generation = computed(() => props.asset.generation);
const typeLabel = computed(() => props.asset.type === "image" ? "图片" : props.asset.type === "video" ? "视频" : "音频");
const sourceLabel = computed(() => props.asset.source === "generated" ? "AI 生成" : "用户上传");
const statusLabel = computed(() => ({ ready: "已完成", generating: "生成中", needs_review: "等待确认", failed: "失败" })[props.asset.status]);
const videoModeLabel = computed(() => ({ text: "文生视频", frames: "首尾帧", reference: "全能参考" })[generation.value?.videoMode || ""] || generation.value?.videoMode || "");
const canRecreate = computed(() => Boolean(generation.value && (props.asset.type === "image" || props.asset.type === "video")));
watch(() => props.asset.id, () => void loadReferencePreviews(), { immediate: true });
onBeforeUnmount(revokeReferencePreviews);
const detailRows = computed(() => {
    const task = generation.value;
    const rows = [
        ["素材类型", typeLabel.value],
        ["来源", sourceLabel.value],
        ["状态", statusLabel.value],
        ["文件大小", formatBytes(props.asset.sizeBytes)],
        ["文件名称", props.asset.originalName || ""],
        ["文件格式", props.asset.mimeType || ""],
        ["画面尺寸", props.asset.width > 0 && props.asset.height > 0 ? `${props.asset.width} × ${props.asset.height}` : ""],
        ["媒体时长", props.asset.durationSeconds !== undefined ? formatSeconds(props.asset.durationSeconds) : ""],
        ["创建时间", formatDate(props.asset.createdAt)],
    ];
    if (!task)
        return rows.filter(([, value]) => value);
    rows.splice(3, 0, ["模型", task.model], ["任务状态", task.status], ["执行器", task.provider], ["渠道", task.channelName || "-"], ["协议", task.protocol || task.provider], ["生成模式", videoModeLabel.value], ["画面比例", task.ratio], ["清晰度", task.quality], ["请求时长", task.requestedDurationSeconds ? `${task.requestedDurationSeconds} 秒` : ""], ["声音", props.asset.type === "video" ? (task.soundEnabled ? "有声音" : "无声音") : ""], ["水印", props.asset.type === "video" ? (task.watermarkEnabled ? "有水印" : "无水印") : ""], ["参考素材", `${task.referenceCount} 个`], ["消耗积分", formatNumber(task.pointsCost)], ["执行耗时", task.executionDurationMs !== undefined ? formatMilliseconds(task.executionDurationMs) : ""], ["重试次数", `${task.retryCount} 次`], ["开始时间", task.startedAt ? formatDate(task.startedAt) : ""], ["完成时间", task.completedAt ? formatDate(task.completedAt) : ""], ["任务 ID", task.taskId], ["上游任务 ID", task.upstreamTaskId || ""], ["素材 ID", props.asset.id]);
    return rows.filter(([, value]) => value !== "");
});
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatSeconds(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
function formatMilliseconds(milliseconds) {
    if (milliseconds < 1000)
        return `${milliseconds} 毫秒`;
    return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} 秒`;
}
function formatDate(value) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
function referenceRoleLabel(role) {
    return ({ first_frame: "首帧", last_frame: "尾帧", reference_image: "参考图", reference_video: "参考视频", reference_audio: "参考音频" })[role] || role;
}
function revokeReferencePreviews() {
    Object.values(referencePreviewUrls.value).forEach((url) => URL.revokeObjectURL(url));
    referencePreviewUrls.value = {};
}
async function loadReferencePreviews() {
    const assetID = props.asset.id;
    revokeReferencePreviews();
    const imageReferences = props.asset.generation?.references?.filter((reference) => reference.type === "image") || [];
    const entries = await Promise.all(imageReferences.map(async (reference) => {
        try {
            const separator = reference.url.includes("?") ? "&" : "?";
            const blob = await assetApi.getAssetContent(`${reference.url}${separator}thumbnail=1`);
            return [reference.assetId, URL.createObjectURL(blob)];
        }
        catch {
            return [reference.assetId, ""];
        }
    }));
    if (props.asset.id !== assetID) {
        entries.forEach(([, url]) => url && URL.revokeObjectURL(url));
        return;
    }
    referencePreviewUrls.value = Object.fromEntries(entries);
}
async function downloadAsset() {
    if (downloading.value)
        return;
    downloading.value = true;
    try {
        const blob = await assetApi.getAssetContent(props.asset.downloadUrl);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = props.asset.originalName || props.asset.title;
        link.click();
        URL.revokeObjectURL(url);
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "素材下载失败"));
    }
    finally {
        downloading.value = false;
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(generation, {});
// @ts-ignore
__VLS_withDotValue(referencePreviewUrls, {});
// @ts-ignore
__VLS_withDotValue(canRecreate, {});
// @ts-ignore
__VLS_withDotValue(downloading, {});
void {};
/** @type {__VLS_StyleScopedClasses['asset-viewer__media']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__media']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__audio']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__prompt']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__references']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__references']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__references']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__references']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__recreate']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__media']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-viewer__prompt']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (__VLS_unwrap(emit, {})('close'));
            // @ts-ignore
            [emit,];
        } },
    ...{ class: "asset-viewer" },
    role: "dialog",
    'aria-modal': "true",
    'aria-label': (__VLS_ctx.asset.title),
});
/** @type {__VLS_StyleScopedClasses['asset-viewer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "asset-viewer__panel" },
});
/** @type {__VLS_StyleScopedClasses['asset-viewer__panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "asset-viewer__media" },
});
/** @type {__VLS_StyleScopedClasses['asset-viewer__media']} */ ;
if (__VLS_ctx.asset.type === 'image') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
        src: (__VLS_ctx.mediaUrl),
        alt: (__VLS_ctx.asset.title),
    });
}
else if (__VLS_ctx.asset.type === 'video') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.video)({
        src: (__VLS_ctx.mediaUrl),
        controls: true,
        autoplay: true,
    });
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "asset-viewer__audio" },
    });
    /** @type {__VLS_StyleScopedClasses['asset-viewer__audio']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.Music} */
    Music;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (38),
    }));
    const __VLS_2 = __VLS_1({
        size: (38),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.audio)({
        src: (__VLS_ctx.mediaUrl),
        controls: true,
    });
}
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ class: "asset-viewer__details" },
});
/** @type {__VLS_StyleScopedClasses['asset-viewer__details']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "asset-viewer__scroll" },
});
/** @type {__VLS_StyleScopedClasses['asset-viewer__scroll']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "asset-viewer__eyebrow" },
});
/** @type {__VLS_StyleScopedClasses['asset-viewer__eyebrow']} */ ;
if (__VLS_ctx.asset.type === 'image') {
    let __VLS_5;
    /** @ts-ignore @type { | typeof __VLS_components.Image} */
    Image;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_7 = __VLS_6({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
else if (__VLS_ctx.asset.type === 'video') {
    let __VLS_10;
    /** @ts-ignore @type { | typeof __VLS_components.Video} */
    Video;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_12 = __VLS_11({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
}
else {
    let __VLS_15;
    /** @ts-ignore @type { | typeof __VLS_components.Music} */
    Music;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_17 = __VLS_16({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
}
(__VLS_unwrap(typeLabel, {}));
(__VLS_unwrap(statusLabel, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
(__VLS_ctx.asset.title);
if (generation.value?.prompt) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "asset-viewer__prompt" },
    });
    /** @type {__VLS_StyleScopedClasses['asset-viewer__prompt']} */ ;
    (generation.value.prompt);
}
if (generation.value?.references?.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "asset-viewer__references" },
        'aria-label': "参考素材",
    });
    /** @type {__VLS_StyleScopedClasses['asset-viewer__references']} */ ;
    const __VLS_20 = __VLS_tryAsConstant((generation.value.references));
    for (const [reference] of __VLS_vFor(__VLS_nonNull(__VLS_20))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (reference.assetId),
            title: (`${referenceRoleLabel(reference.role)} · ${reference.title}`),
        });
        if (reference.type === 'image' && referencePreviewUrls.value[reference.assetId]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (referencePreviewUrls.value[reference.assetId]),
                alt: (reference.title),
            });
        }
        else if (reference.type === 'video') {
            let __VLS_21;
            /** @ts-ignore @type { | typeof __VLS_components.Video} */
            Video;
            // @ts-ignore
            const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
                // @ts-ignore
                size: (18),
            }));
            const __VLS_23 = __VLS_22({
                size: (18),
            }, ...__VLS_functionalComponentArgsRest(__VLS_22));
        }
        else if (reference.type === 'audio') {
            let __VLS_26;
            /** @ts-ignore @type { | typeof __VLS_components.Music} */
            Music;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                // @ts-ignore
                size: (18),
            }));
            const __VLS_28 = __VLS_27({
                size: (18),
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        }
        else {
            let __VLS_31;
            /** @ts-ignore @type { | typeof __VLS_components.Image} */
            Image;
            // @ts-ignore
            const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                // @ts-ignore
                size: (18),
            }));
            const __VLS_33 = __VLS_32({
                size: (18),
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (referenceRoleLabel(reference.role));
        // @ts-ignore
        [asset, asset, asset, asset, asset, asset, asset, mediaUrl, mediaUrl, mediaUrl, typeLabel, statusLabel, generation, generation, generation, generation, referencePreviewUrls, referencePreviewUrls,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({});
const __VLS_36 = __VLS_tryAsConstant((__VLS_unwrap(detailRows, {})));
for (const [[label, value], index] of __VLS_vFor(__VLS_nonNull(__VLS_36))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
        key: (`${label}-${index}`),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
    (label);
    __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
        ...{ class: ({ 'is-id': label.includes('ID') }) },
    });
    /** @type {__VLS_StyleScopedClasses['is-id']} */ ;
    (value);
    // @ts-ignore
    [detailRows,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
    ...{ class: "asset-viewer__actions" },
});
/** @type {__VLS_StyleScopedClasses['asset-viewer__actions']} */ ;
if (canRecreate.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(canRecreate.value))
                    throw 0;
                return (__VLS_unwrap(emit, {})('recreate', __VLS_ctx.asset));
                // @ts-ignore
                [emit, asset, canRecreate,];
            } },
        ...{ class: "asset-viewer__recreate" },
        type: "button",
    });
    /** @type {__VLS_StyleScopedClasses['asset-viewer__recreate']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (downloadAsset) },
    type: "button",
    title: "下载素材",
    'aria-label': "下载素材",
    disabled: (downloading.value),
});
if (downloading.value) {
    let __VLS_37;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
        // @ts-ignore
        ...{ class: "spin" }, size: (18),
    }));
    const __VLS_39 = __VLS_38({
        ...{ class: "spin" },
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_42;
    /** @ts-ignore @type { | typeof __VLS_components.Download} */
    Download;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
        // @ts-ignore
        size: (18),
    }));
    const __VLS_44 = __VLS_43({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (__VLS_unwrap(emit, {})('close'));
            // @ts-ignore
            [emit, downloading, downloading,];
        } },
    type: "button",
    title: "关闭预览",
    'aria-label': "关闭预览",
});
let __VLS_47;
/** @ts-ignore @type { | typeof __VLS_components.X} */
X;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
    // @ts-ignore
    size: (18),
}));
const __VLS_49 = __VLS_48({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
