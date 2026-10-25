import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useDebounceFn, useIntervalFn } from "@vueuse/core";
import { ChevronLeft, ChevronRight, CircleAlert, Download, Image, Images, LoaderCircle, Play, Plus, Search, Upload, Video, X, } from "@lucide/vue";
import * as assetApi from "@/services/assets";
import { apiErrorMessage } from "@/services/http";
import { notification } from "@/services/notifications";
import { useAuthStore } from "@/stores/auth";
const filters = [
    { value: "all", label: "全部", icon: Images },
    { value: "image", label: "图片", icon: Image },
    { value: "video", label: "视频", icon: Video },
];
const assets = ref([]);
const total = ref(0);
const activeFilter = ref("all");
const searchKeyword = ref("");
const currentPage = ref(1);
const pageSize = ref(8);
const loading = ref(false);
const refreshing = ref(false);
const uploading = ref(false);
const fileInput = ref(null);
const previewUrls = ref({});
const previewSignatures = ref({});
const selectedAsset = ref(null);
const authStore = useAuthStore();
let loadSequence = 0;
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const hasGeneratingAssets = computed(() => assets.value.some((asset) => asset.status === "generating"));
const refreshInterval = Number(import.meta.env.VITE_GENERATION_REFRESH_INTERVAL_MS || 3000);
const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(() => {
    if (!loading.value && !refreshing.value && hasGeneratingAssets.value)
        void loadAssets({ silent: true });
}, Number.isFinite(refreshInterval) && refreshInterval > 0 ? refreshInterval : 3000, { immediate: false });
watch([activeFilter, currentPage, pageSize], () => void loadAssets(), { immediate: true });
const searchAssets = useDebounceFn(() => {
    if (currentPage.value !== 1)
        currentPage.value = 1;
    else
        void loadAssets();
}, 300);
watch(searchKeyword, () => searchAssets());
watch(hasGeneratingAssets, (hasGenerating) => (hasGenerating ? resumeRefresh() : pauseRefresh()), { immediate: true });
onBeforeUnmount(() => {
    pauseRefresh();
    revokePreviewUrls();
});
async function loadAssets(options = {}) {
    const sequence = ++loadSequence;
    if (options.silent)
        refreshing.value = true;
    else
        loading.value = true;
    try {
        const result = await assetApi.listAssets({
            page: currentPage.value,
            pageSize: pageSize.value,
            type: activeFilter.value === "all" ? undefined : activeFilter.value,
            search: searchKeyword.value.trim() || undefined,
        });
        if (sequence !== loadSequence)
            return;
        const refunded = result.items.some((asset) => asset.status === "failed" && assets.value.find((current) => current.id === asset.id)?.status === "generating");
        assets.value = result.items;
        if (refunded)
            void authStore.refreshPointsBalance();
        total.value = result.total;
        if (currentPage.value > totalPages.value) {
            currentPage.value = totalPages.value;
            return;
        }
        await loadPreviewUrls(result.items, sequence);
    }
    catch (error) {
        if (sequence === loadSequence)
            notification.error(apiErrorMessage(error, "素材加载失败"));
    }
    finally {
        if (sequence === loadSequence) {
            loading.value = false;
            refreshing.value = false;
        }
    }
}
async function loadPreviewUrls(items, sequence) {
    const existingUrls = previewUrls.value;
    const existingSignatures = previewSignatures.value;
    const entries = await Promise.all(items.map(async (asset) => {
        try {
            const signature = `${asset.status}:${asset.url}:${asset.sizeBytes}`;
            if (asset.status !== "ready" || !asset.url)
                return { id: asset.id, url: "", signature, created: false };
            if (existingUrls[asset.id] && existingSignatures[asset.id] === signature) {
                return { id: asset.id, url: existingUrls[asset.id], signature, created: false };
            }
            const blob = await assetApi.getAssetContent(asset.url);
            return { id: asset.id, url: URL.createObjectURL(blob), signature, created: true };
        }
        catch {
            return { id: asset.id, url: "", signature: "", created: false };
        }
    }));
    if (sequence !== loadSequence) {
        entries.forEach((entry) => entry.created && entry.url && URL.revokeObjectURL(entry.url));
        return;
    }
    const nextUrls = Object.fromEntries(entries.map((entry) => [entry.id, entry.url]));
    const nextSignatures = Object.fromEntries(entries.map((entry) => [entry.id, entry.signature]));
    Object.entries(existingUrls).forEach(([id, url]) => {
        if (url && nextUrls[id] !== url)
            URL.revokeObjectURL(url);
    });
    previewUrls.value = nextUrls;
    previewSignatures.value = nextSignatures;
}
function revokePreviewUrls() {
    Object.values(previewUrls.value).forEach((url) => url && URL.revokeObjectURL(url));
    previewUrls.value = {};
    previewSignatures.value = {};
}
function selectFilter(filter) {
    if (activeFilter.value === filter)
        return;
    activeFilter.value = filter;
    currentPage.value = 1;
}
function chooseAsset() {
    if (!uploading.value)
        fileInput.value?.click();
}
async function handleFileSelection(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file)
        return;
    uploading.value = true;
    try {
        await assetApi.uploadAsset(file);
        notification.success("素材上传成功");
        activeFilter.value = "all";
        searchKeyword.value = "";
        if (currentPage.value !== 1)
            currentPage.value = 1;
        else
            await loadAssets();
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "素材上传失败"));
    }
    finally {
        uploading.value = false;
        input.value = "";
    }
}
function openAsset(asset) {
    if (asset.status !== "ready")
        return;
    if (!previewUrls.value[asset.id]) {
        notification.warning("素材预览暂不可用");
        return;
    }
    selectedAsset.value = asset;
}
async function downloadAsset(asset) {
    try {
        const blob = await assetApi.getAssetContent(asset.downloadUrl);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = asset.title;
        link.click();
        URL.revokeObjectURL(url);
    }
    catch (error) {
        notification.error(apiErrorMessage(error, "素材下载失败"));
    }
}
function setPage(page) {
    if (page >= 1 && page <= totalPages.value && page !== currentPage.value)
        currentPage.value = page;
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatDimensions(asset) {
    return asset.width > 0 && asset.height > 0 ? `${asset.width} × ${asset.height}` : formatBytes(asset.sizeBytes);
}
function formatDate(value) {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function formatDuration(seconds) {
    if (seconds === undefined)
        return "";
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
function sourceLabel(source) {
    return source === "generated" ? "AI 生成" : "用户上传";
}
function statusLabel(status) {
    if (status === "generating")
        return "生成中";
    if (status === "failed")
        return "生成失败";
    return "已完成";
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
// @ts-ignore
__VLS_withDotValue(uploading, {});
// @ts-ignore
__VLS_withDotValue(activeFilter, {});
// @ts-ignore
__VLS_withDotValue(loading, {});
// @ts-ignore
__VLS_withDotValue(assets, {});
// @ts-ignore
__VLS_withDotValue(previewUrls, {});
// @ts-ignore
__VLS_withDotValue(currentPage, {});
// @ts-ignore
__VLS_withDotValue(selectedAsset, {});
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "assets-page" },
});
/** @type {__VLS_StyleScopedClasses['assets-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "assets-header" },
});
/** @type {__VLS_StyleScopedClasses['assets-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (chooseAsset) },
    ...{ class: "assets-upload" },
    type: "button",
    disabled: (uploading.value),
});
/** @type {__VLS_StyleScopedClasses['assets-upload']} */ ;
if (uploading.value) {
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
    LoaderCircle;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "spin" }, size: (17),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "spin" },
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
}
else {
    let __VLS_5;
    /** @ts-ignore @type { | typeof __VLS_components.Plus} */
    Plus;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (17),
    }));
    const __VLS_7 = __VLS_6({
        size: (17),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(uploading.value ? "上传中" : "上传素材");
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (handleFileSelection) },
    ref: "fileInput",
    ...{ class: "asset-file-input" },
    type: "file",
    accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime",
});
/** @type {__VLS_StyleScopedClasses['asset-file-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "assets-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['assets-toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "asset-search" },
});
/** @type {__VLS_StyleScopedClasses['asset-search']} */ ;
let __VLS_10;
/** @ts-ignore @type { | typeof __VLS_components.Search} */
Search;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
    // @ts-ignore
    size: (16),
}));
const __VLS_12 = __VLS_11({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    type: "search",
    placeholder: "搜索素材名称",
});
(__VLS_unwrap(searchKeyword, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "asset-filters" },
    role: "tablist",
    'aria-label': "素材类型",
});
/** @type {__VLS_StyleScopedClasses['asset-filters']} */ ;
const __VLS_15 = __VLS_tryAsConstant((__VLS_unwrap(filters, {})));
for (const [filter] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                return (selectFilter(filter.value));
                // @ts-ignore
                [uploading, uploading, uploading, searchKeyword, filters,];
            } },
        key: (filter.value),
        type: "button",
        role: "tab",
        'aria-selected': (activeFilter.value === filter.value),
        ...{ class: ({ 'asset-filter--active': activeFilter.value === filter.value }) },
    });
    /** @type {__VLS_StyleScopedClasses['asset-filter--active']} */ ;
    const __VLS_16 = (filter.icon);
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_18 = __VLS_17({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (filter.label);
    // @ts-ignore
    [activeFilter, activeFilter,];
}
if (loading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "assets-grid" },
        'aria-label': "正在加载素材",
    });
    /** @type {__VLS_StyleScopedClasses['assets-grid']} */ ;
    const __VLS_21 = __VLS_tryAsConstant((__VLS_unwrap(pageSize, {})));
    for (const [index] of __VLS_vFor(__VLS_nonNull(__VLS_21))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
            key: (index),
            ...{ class: "asset-card asset-card--loading" },
        });
        /** @type {__VLS_StyleScopedClasses['asset-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['asset-card--loading']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({});
        // @ts-ignore
        [loading, pageSize,];
    }
}
else if (assets.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "assets-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['assets-grid']} */ ;
    const __VLS_22 = __VLS_tryAsConstant((assets.value));
    for (const [asset] of __VLS_vFor(__VLS_nonNull(__VLS_22))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
            key: (asset.id),
            ...{ class: "asset-card" },
            ...{ class: (`asset-card--${asset.status}`) },
        });
        /** @type {__VLS_StyleScopedClasses['asset-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(assets.value.length))
                        throw 0;
                    return (openAsset(asset));
                    // @ts-ignore
                    [assets, assets,];
                } },
            ...{ class: "asset-card__preview" },
            type: "button",
            disabled: (asset.status !== 'ready'),
        });
        /** @type {__VLS_StyleScopedClasses['asset-card__preview']} */ ;
        if (asset.status === 'ready' && previewUrls.value[asset.id] && asset.type === 'image') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (previewUrls.value[asset.id]),
                alt: (asset.title),
            });
        }
        else if (asset.status === 'ready' && previewUrls.value[asset.id]) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.video)({
                src: (previewUrls.value[asset.id]),
                muted: true,
                preload: "metadata",
            });
        }
        else if (asset.status === 'generating') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "asset-card__generation-state" },
            });
            /** @type {__VLS_StyleScopedClasses['asset-card__generation-state']} */ ;
            let __VLS_23;
            /** @ts-ignore @type { | typeof __VLS_components.LoaderCircle} */
            LoaderCircle;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
                // @ts-ignore
                ...{ class: "spin" }, size: (25),
            }));
            const __VLS_25 = __VLS_24({
                ...{ class: "spin" },
                size: (25),
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            /** @type {__VLS_StyleScopedClasses['spin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        }
        else if (asset.status === 'failed') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "asset-card__generation-state asset-card__generation-state--failed" },
                title: (asset.errorMessage),
            });
            /** @type {__VLS_StyleScopedClasses['asset-card__generation-state']} */ ;
            /** @type {__VLS_StyleScopedClasses['asset-card__generation-state--failed']} */ ;
            let __VLS_28;
            /** @ts-ignore @type { | typeof __VLS_components.CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
                // @ts-ignore
                size: (25),
            }));
            const __VLS_30 = __VLS_29({
                size: (25),
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (asset.errorMessage || "请稍后重试");
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "asset-card__media-loading" },
            });
            /** @type {__VLS_StyleScopedClasses['asset-card__media-loading']} */ ;
            if (asset.type === 'image') {
                let __VLS_33;
                /** @ts-ignore @type { | typeof __VLS_components.Image} */
                Image;
                // @ts-ignore
                const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
                    // @ts-ignore
                    size: (24),
                }));
                const __VLS_35 = __VLS_34({
                    size: (24),
                }, ...__VLS_functionalComponentArgsRest(__VLS_34));
            }
            else {
                let __VLS_38;
                /** @ts-ignore @type { | typeof __VLS_components.Video} */
                Video;
                // @ts-ignore
                const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
                    // @ts-ignore
                    size: (24),
                }));
                const __VLS_40 = __VLS_39({
                    size: (24),
                }, ...__VLS_functionalComponentArgsRest(__VLS_39));
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "asset-card__type" },
        });
        /** @type {__VLS_StyleScopedClasses['asset-card__type']} */ ;
        if (asset.type === 'image') {
            let __VLS_43;
            /** @ts-ignore @type { | typeof __VLS_components.Image} */
            Image;
            // @ts-ignore
            const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
                // @ts-ignore
                size: (13),
            }));
            const __VLS_45 = __VLS_44({
                size: (13),
            }, ...__VLS_functionalComponentArgsRest(__VLS_44));
        }
        else {
            let __VLS_48;
            /** @ts-ignore @type { | typeof __VLS_components.Video} */
            Video;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
                // @ts-ignore
                size: (13),
            }));
            const __VLS_50 = __VLS_49({
                size: (13),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        }
        (asset.type === "image" ? "图片" : "视频");
        if (asset.type === 'video' && asset.status === 'ready') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "asset-card__play" },
            });
            /** @type {__VLS_StyleScopedClasses['asset-card__play']} */ ;
            let __VLS_53;
            /** @ts-ignore @type { | typeof __VLS_components.Play} */
            Play;
            // @ts-ignore
            const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
                // @ts-ignore
                size: (18), fill: "currentColor",
            }));
            const __VLS_55 = __VLS_54({
                size: (18),
                fill: "currentColor",
            }, ...__VLS_functionalComponentArgsRest(__VLS_54));
        }
        if (formatDuration(asset.durationSeconds)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "asset-card__duration" },
            });
            /** @type {__VLS_StyleScopedClasses['asset-card__duration']} */ ;
            (formatDuration(asset.durationSeconds));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "asset-card__meta" },
        });
        /** @type {__VLS_StyleScopedClasses['asset-card__meta']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (asset.title);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "asset-card__details" },
        });
        /** @type {__VLS_StyleScopedClasses['asset-card__details']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
            ...{ class: (`is-${asset.source}`) },
        });
        (sourceLabel(asset.source));
        __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({
            ...{ class: (`is-${asset.status}`) },
        });
        (statusLabel(asset.status));
        (formatDimensions(asset));
        (formatDate(asset.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: // @ts-ignore
                (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!(assets.value.length))
                        throw 0;
                    return (downloadAsset(asset));
                    // @ts-ignore
                    [previewUrls, previewUrls, previewUrls, previewUrls,];
                } },
            type: "button",
            'aria-label': (`下载 ${asset.title}`),
            disabled: (asset.status !== 'ready'),
        });
        let __VLS_58;
        /** @ts-ignore @type { | typeof __VLS_components.Download} */
        Download;
        // @ts-ignore
        const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
            // @ts-ignore
            size: (16),
        }));
        const __VLS_60 = __VLS_59({
            size: (16),
        }, ...__VLS_functionalComponentArgsRest(__VLS_59));
        // @ts-ignore
        [];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "assets-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['assets-empty']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_63;
    /** @ts-ignore @type { | typeof __VLS_components.Upload} */
    Upload;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent1(__VLS_63, new __VLS_63({
        // @ts-ignore
        size: (23),
    }));
    const __VLS_65 = __VLS_64({
        size: (23),
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
    ...{ class: "assets-pagination" },
});
/** @type {__VLS_StyleScopedClasses['assets-pagination']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_unwrap(total, {}));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "assets-pagination__controls" },
});
/** @type {__VLS_StyleScopedClasses['assets-pagination__controls']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (setPage(currentPage.value - 1));
            // @ts-ignore
            [total, currentPage,];
        } },
    type: "button",
    'aria-label': "上一页",
    disabled: (currentPage.value <= 1),
});
let __VLS_68;
/** @ts-ignore @type { | typeof __VLS_components.ChevronLeft} */
ChevronLeft;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent1(__VLS_68, new __VLS_68({
    // @ts-ignore
    size: (17),
}));
const __VLS_70 = __VLS_69({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
const __VLS_73 = __VLS_tryAsConstant((__VLS_unwrap(totalPages, {})));
for (const [page] of __VLS_vFor(__VLS_nonNull(__VLS_73))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                return (setPage(page));
                // @ts-ignore
                [currentPage, totalPages,];
            } },
        key: (page),
        type: "button",
        ...{ class: ({ 'is-current': currentPage.value === page }) },
        'aria-label': (`第 ${page} 页`),
    });
    /** @type {__VLS_StyleScopedClasses['is-current']} */ ;
    (page);
    // @ts-ignore
    [currentPage,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: // @ts-ignore
        (...[$event]) => {
            void $event;
            return (setPage(currentPage.value + 1));
            // @ts-ignore
            [currentPage,];
        } },
    type: "button",
    'aria-label': "下一页",
    disabled: (currentPage.value >= __VLS_unwrap(totalPages, {})),
});
let __VLS_74;
/** @ts-ignore @type { | typeof __VLS_components.ChevronRight} */
ChevronRight;
// @ts-ignore
const __VLS_75 = __VLS_asFunctionalComponent1(__VLS_74, new __VLS_74({
    // @ts-ignore
    size: (17),
}));
const __VLS_76 = __VLS_75({
    size: (17),
}, ...__VLS_functionalComponentArgsRest(__VLS_75));
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "assets-page-size" },
});
/** @type {__VLS_StyleScopedClasses['assets-page-size']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_unwrap(pageSize, {})),
    'aria-label': "每页数量",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: (8),
});
__VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
    value: (12),
});
if (selectedAsset.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedAsset.value))
                    throw 0;
                return (selectedAsset.value = null);
                // @ts-ignore
                [pageSize, currentPage, totalPages, selectedAsset, selectedAsset,];
            } },
        ...{ class: "asset-preview-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-label': (selectedAsset.value.title),
    });
    /** @type {__VLS_StyleScopedClasses['asset-preview-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "asset-preview-dialog__body" },
    });
    /** @type {__VLS_StyleScopedClasses['asset-preview-dialog__body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: // @ts-ignore
            (...[$event]) => {
                void $event;
                if (!(selectedAsset.value))
                    throw 0;
                return (selectedAsset.value = null);
                // @ts-ignore
                [selectedAsset, selectedAsset,];
            } },
        type: "button",
        'aria-label': "关闭预览",
    });
    let __VLS_79;
    /** @ts-ignore @type { | typeof __VLS_components.X} */
    X;
    // @ts-ignore
    const __VLS_80 = __VLS_asFunctionalComponent1(__VLS_79, new __VLS_79({
        // @ts-ignore
        size: (19),
    }));
    const __VLS_81 = __VLS_80({
        size: (19),
    }, ...__VLS_functionalComponentArgsRest(__VLS_80));
    if (selectedAsset.value.type === 'image') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
            src: (previewUrls.value[selectedAsset.value.id]),
            alt: (selectedAsset.value.title),
        });
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.video)({
            src: (previewUrls.value[selectedAsset.value.id]),
            controls: true,
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (selectedAsset.value.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (formatBytes(selectedAsset.value.sizeBytes));
    (formatDate(selectedAsset.value.createdAt));
}
// @ts-ignore
[previewUrls, previewUrls, selectedAsset, selectedAsset, selectedAsset, selectedAsset, selectedAsset, selectedAsset, selectedAsset,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
